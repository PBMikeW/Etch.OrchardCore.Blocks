using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OrchardCore.ContentManagement.Metadata;
using OrchardCore.Security;
using OrchardCore.Security.Permissions;
using OrchardCore.Security.Services;
using Xunit;

namespace Etch.OrchardCore.Blocks.Tests;

/// <summary>
/// Migrations.UpdateFrom12Async: on a tenant that had the Blocks feature before ManageRawBlocks existed, the roles that
/// can edit all content keep raw blocks; type-scoped roles (agents, project editors) don't get them.
/// </summary>
public class RawBlockMigrationTests
{
    /// <summary>The roles as the agent and project structure recipes set them up (trimmed to what matters here).</summary>
    private static List<Role> Roles() =>
    [
        Role("Administrator"),
        Role("Editor", "EditContent", "PublishContent", "ManageTemplates"),
        Role("Publisher", "PublishContent"),
        Role("Agents", "AccessAdminPanel", "Edit_Page", "Publish_Page", "Edit_News", "Publish_News", "EditOwnContent", "PublishOwnContent"),
        Role("Project editor", "Edit_LandingPage", "Publish_LandingPage", "EditOwn_LandingPage"),
        Role("Authenticated", "ViewContent"),
        Role("Anonymous", "ViewContent"),
    ];

    private static Role Role(string name, params string[] permissions)
    {
        var role = new Role { RoleName = name };
        role.RoleClaims.AddRange(permissions.Select(RoleClaim.Create));
        return role;
    }

    private static string[] Permissions(Role role) => role.RoleClaims.Where(c => c.ClaimType == Permission.ClaimType).Select(c => c.ClaimValue).ToArray();

    /// <summary>Just enough of OrchardCore's RoleStore for RoleManager's claim calls.</summary>
    private sealed class InMemoryRoleStore : IRoleClaimStore<IRole>
    {
        public int Updates { get; private set; }

        public Task<IList<Claim>> GetClaimsAsync(IRole role, CancellationToken cancellationToken = default)
            => Task.FromResult<IList<Claim>>(((Role)role).RoleClaims.Select(c => c.ToClaim()).ToList());

        public Task AddClaimAsync(IRole role, Claim claim, CancellationToken cancellationToken = default)
        {
            ((Role)role).RoleClaims.Add(new RoleClaim(claim.Type, claim.Value));
            return Task.CompletedTask;
        }

        public Task RemoveClaimAsync(IRole role, Claim claim, CancellationToken cancellationToken = default) => throw new NotSupportedException();

        public Task<IdentityResult> UpdateAsync(IRole role, CancellationToken cancellationToken)
        {
            Updates++;
            return Task.FromResult(IdentityResult.Success);
        }

        public Task<string> GetRoleNameAsync(IRole role, CancellationToken cancellationToken) => Task.FromResult(role.RoleName);

        public Task<string> GetNormalizedRoleNameAsync(IRole role, CancellationToken cancellationToken) => Task.FromResult(role.RoleName.ToUpperInvariant());

        public Task SetNormalizedRoleNameAsync(IRole role, string normalizedName, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<string> GetRoleIdAsync(IRole role, CancellationToken cancellationToken) => Task.FromResult(role.RoleName);

        public Task SetRoleNameAsync(IRole role, string roleName, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IdentityResult> CreateAsync(IRole role, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IdentityResult> DeleteAsync(IRole role, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IRole> FindByIdAsync(string roleId, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<IRole> FindByNameAsync(string normalizedRoleName, CancellationToken cancellationToken) => throw new NotSupportedException();

        public void Dispose()
        {
        }
    }

    private static (Migrations Migrations, InMemoryRoleStore Store) Migrations(List<Role> roles, bool withRoles = true)
    {
        var services = new ServiceCollection();
        var store = new InMemoryRoleStore();

        if (withRoles)
        {
            var roleService = new Mock<IRoleService>();
            roleService.Setup(s => s.GetRolesAsync()).ReturnsAsync(() => roles.Cast<IRole>().ToList());
            roleService.Setup(s => s.IsAdminRoleAsync(It.IsAny<string>())).Returns((string name) => ValueTask.FromResult(name == "Administrator"));
            services.AddSingleton(roleService.Object);
            services.AddSingleton(new RoleManager<IRole>(store, [], new UpperInvariantLookupNormalizer(), new IdentityErrorDescriber(), NullLogger<RoleManager<IRole>>.Instance));
        }

        var migrations = new Migrations(Mock.Of<IContentDefinitionManager>(), NullLogger<Migrations>.Instance, services.BuildServiceProvider());
        return (migrations, store);
    }

    [Fact]
    public async Task Roles_that_can_edit_all_content_are_granted_it_and_type_scoped_roles_are_not()
    {
        var roles = Roles();
        var (migrations, _) = Migrations(roles);

        Assert.Equal(13, await migrations.UpdateFrom12Async());

        var granted = roles.Where(r => Permissions(r).Contains("ManageRawBlocks")).Select(r => r.RoleName);
        Assert.Equal(["Editor", "Publisher"], granted);
        Assert.Empty(Permissions(roles.Single(r => r.RoleName == "Administrator")));
    }

    [Fact]
    public async Task The_grant_is_idempotent()
    {
        var roles = Roles();
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom12Async();
        var updatesAfterFirstRun = store.Updates;
        await migrations.UpdateFrom12Async();

        Assert.Equal(2, updatesAfterFirstRun);
        Assert.Equal(updatesAfterFirstRun, store.Updates);
        Assert.All(roles, r => Assert.True(Permissions(r).Count(p => p == "ManageRawBlocks") <= 1));
    }

    [Fact]
    public async Task A_role_that_already_holds_it_is_left_alone()
    {
        var roles = new List<Role> { Role("Editor", "EditContent", "ManageRawBlocks") };
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom12Async();

        Assert.Equal(0, store.Updates);
        Assert.Single(Permissions(roles[0]), p => p == "ManageRawBlocks");
    }

    [Fact]
    public async Task Without_the_roles_services_it_does_nothing()
    {
        var (migrations, _) = Migrations([], withRoles: false);

        Assert.Equal(13, await migrations.UpdateFrom12Async());
    }
}
