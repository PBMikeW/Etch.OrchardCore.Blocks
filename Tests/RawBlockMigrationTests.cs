using System.Security.Claims;
using Etch.OrchardCore.Blocks.Services;
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
/// Migrations.UpdateFrom12Async grants ManageRawBlocks, on a tenant that had the Blocks feature before it existed, to the
/// roles RawBlockRoles.Qualifies accepts: AccessAdminPanel, EditContent or PublishContent, and not on the never-granted
/// list. UpdateFrom13Async takes it back from every other role, for the tenants that ran the first UpdateFrom12Async,
/// which granted it to any role holding EditContent or PublishContent (www's Authenticated and Registered Users among them).
/// </summary>
public class RawBlockMigrationTests
{
    private const string Raw = "ManageRawBlocks";

    /// <summary>
    /// The roles as the www, Portal, agent and project tenants have them (trimmed to what matters here). Authenticated
    /// and Registered Users are www's: EditContent, EditOwnContent and PublishOwnContent but no AccessAdminPanel.
    /// </summary>
    private static List<Role> Roles() =>
    [
        Role("Administrator"),
        Role("Editor", "AccessAdminPanel", "EditContent", "PublishContent", "ManageTemplates"),
        Role("Digital Solutions Support", "AccessAdminPanel", "EditContent"),
        Role("Publisher", "AccessAdminPanel", "PublishContent"),
        Role("Agents", "AccessAdminPanel", "EditContent", "PublishContent", "Edit_Page", "EditOwnContent", "PublishOwnContent"),
        Role("Project editor", "AccessAdminPanel", "EditContent", "Edit_LandingPage", "Publish_LandingPage"),
        Role("Contributor", "AccessAdminPanel", "EditOwnContent", "PublishOwnContent"),
        Role("Authenticated", "ViewContent", "EditContent", "EditOwnContent", "PublishOwnContent"),
        Role("Registered Users", "EditContent", "EditOwnContent", "PublishOwnContent"),
        Role("Anonymous", "ViewContent"),
    ];

    /// <summary>The roles that hold it once either step has run.</summary>
    private static readonly string[] Qualifying = ["Editor", "Digital Solutions Support", "Publisher"];

    private static Role Role(string name, params string[] permissions)
    {
        var role = new Role { RoleName = name };
        role.RoleClaims.AddRange(permissions.Select(RoleClaim.Create));
        return role;
    }

    private static string[] Permissions(Role role) => role.RoleClaims.Where(c => c.ClaimType == Permission.ClaimType).Select(c => c.ClaimValue).ToArray();

    private static bool HoldsRaw(Role role) => Permissions(role).Any(p => string.Equals(p, Raw, StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<string> Holders(IEnumerable<Role> roles) => roles.Where(HoldsRaw).Select(r => r.RoleName);

    /// <summary>What the first UpdateFrom12Async did: every non-administrator role holding EditContent or PublishContent.</summary>
    private static void ApplyTheOriginalGrant(IEnumerable<Role> roles)
    {
        foreach (var role in roles.Where(r => r.RoleName != "Administrator" && !HoldsRaw(r) && (Permissions(r).Contains("EditContent") || Permissions(r).Contains("PublishContent"))))
        {
            role.RoleClaims.Add(RoleClaim.Create(Raw));
        }
    }

    /// <summary>Just enough of OrchardCore's RoleStore for RoleManager's claim calls, removing as it does (exact value).</summary>
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

        public Task RemoveClaimAsync(IRole role, Claim claim, CancellationToken cancellationToken = default)
        {
            ((Role)role).RoleClaims.RemoveAll(c => c.ClaimType == claim.Type && c.ClaimValue == claim.Value);
            return Task.CompletedTask;
        }

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
            roleService.Setup(s => s.IsAdminRoleAsync(It.IsAny<string>())).Returns((string name) => ValueTask.FromResult(string.Equals(name, "Administrator", StringComparison.OrdinalIgnoreCase)));
            services.AddSingleton(roleService.Object);
            services.AddSingleton(new RoleManager<IRole>(store, [], new UpperInvariantLookupNormalizer(), new IdentityErrorDescriber(), NullLogger<RoleManager<IRole>>.Instance));
        }

        var migrations = new Migrations(Mock.Of<IContentDefinitionManager>(), NullLogger<Migrations>.Instance, services.BuildServiceProvider());
        return (migrations, store);
    }

    // RawBlockRoles.Qualifies

    [Theory]
    [InlineData("Editor", true, "AccessAdminPanel", "EditContent", "PublishContent")]
    [InlineData("Digital Solutions Support", true, "AccessAdminPanel", "EditContent")]
    [InlineData("Publisher", true, "AccessAdminPanel", "PublishContent")]
    [InlineData("Editor", true, "accessadminpanel", "editcontent")]
    [InlineData("Authenticated", false, "EditContent", "EditOwnContent", "PublishOwnContent")]
    [InlineData("Registered Users", false, "EditContent", "EditOwnContent", "PublishOwnContent")]
    [InlineData("Staff without admin", false, "EditContent", "PublishContent")]
    [InlineData("Contributor", false, "AccessAdminPanel", "EditOwnContent", "PublishOwnContent")]
    [InlineData("Agents", false, "AccessAdminPanel", "EditContent", "PublishContent")]
    [InlineData("agents", false, "AccessAdminPanel", "EditContent")]
    [InlineData("Project editor", false, "AccessAdminPanel", "EditContent")]
    [InlineData("PROJECT EDITOR", false, "AccessAdminPanel", "PublishContent")]
    [InlineData("Authenticated", false, "AccessAdminPanel", "EditContent")]
    [InlineData("Registered Users", false, "AccessAdminPanel", "EditContent")]
    [InlineData("Anonymous", false, "AccessAdminPanel", "EditContent")]
    public void A_role_qualifies_only_with_admin_access_all_content_editing_and_a_name_off_the_never_list(string role, bool qualifies, params string[] permissions)
    {
        Assert.Equal(qualifies, RawBlockRoles.Qualifies(role, permissions.ToHashSet(StringComparer.OrdinalIgnoreCase), out var reason));
        Assert.False(string.IsNullOrEmpty(reason));
    }

    // UpdateFrom12Async

    [Fact]
    public async Task UpdateFrom12_grants_only_the_qualifying_staff_roles()
    {
        var roles = Roles();
        var (migrations, store) = Migrations(roles);

        Assert.Equal(13, await migrations.UpdateFrom12Async());

        Assert.Equal(Qualifying, Holders(roles));
        Assert.Equal(Qualifying.Length, store.Updates);
        Assert.Empty(Permissions(roles.Single(r => r.RoleName == "Administrator")));
    }

    [Fact]
    public async Task UpdateFrom12_is_idempotent()
    {
        var roles = Roles();
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom12Async();
        var updatesAfterFirstRun = store.Updates;
        await migrations.UpdateFrom12Async();

        Assert.Equal(Qualifying.Length, updatesAfterFirstRun);
        Assert.Equal(updatesAfterFirstRun, store.Updates);
        Assert.Equal(Qualifying, Holders(roles));
        Assert.All(roles, r => Assert.True(Permissions(r).Count(p => p == Raw) <= 1));
    }

    [Fact]
    public async Task UpdateFrom12_leaves_a_role_that_already_holds_it_alone()
    {
        var roles = new List<Role> { Role("Editor", "AccessAdminPanel", "EditContent", Raw) };
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom12Async();

        Assert.Equal(0, store.Updates);
        Assert.Single(Permissions(roles[0]), p => p == Raw);
    }

    // UpdateFrom13Async

    [Fact]
    public async Task UpdateFrom13_revokes_what_the_original_grant_gave_outside_the_rule()
    {
        var roles = Roles();
        ApplyTheOriginalGrant(roles);
        Assert.Equal(["Editor", "Digital Solutions Support", "Publisher", "Agents", "Project editor", "Authenticated", "Registered Users"], Holders(roles));

        var (migrations, store) = Migrations(roles);

        Assert.Equal(14, await migrations.UpdateFrom13Async());

        Assert.Equal(Qualifying, Holders(roles));
        Assert.Equal(4, store.Updates);
        // Nothing else on the revoked roles changes.
        Assert.Equal(["ViewContent", "EditContent", "EditOwnContent", "PublishOwnContent"], Permissions(roles.Single(r => r.RoleName == "Authenticated")));
        Assert.Equal(["AccessAdminPanel", "EditContent", "PublishContent", "Edit_Page", "EditOwnContent", "PublishOwnContent"], Permissions(roles.Single(r => r.RoleName == "Agents")));
    }

    [Fact]
    public async Task UpdateFrom13_revokes_a_grant_outside_the_rule_whatever_its_origin_and_however_it_is_cased()
    {
        var roles = new List<Role>
        {
            Role("Contributor", "AccessAdminPanel", "EditOwnContent", Raw),
            Role("Marketing", "AccessAdminPanel", "manageRawBlocks"),
            Role("Registered Users", "EditContent", "MANAGERAWBLOCKS", Raw),
            Role("agents", "AccessAdminPanel", "EditContent", Raw),
            Role("Digital Solutions Support", "AccessAdminPanel", "EditContent", Raw),
        };
        var (migrations, _) = Migrations(roles);

        await migrations.UpdateFrom13Async();

        Assert.Equal(["Digital Solutions Support"], Holders(roles));
        Assert.Equal(["EditContent"], Permissions(roles.Single(r => r.RoleName == "Registered Users")));
    }

    [Fact]
    public async Task UpdateFrom13_leaves_the_administrator_role_alone()
    {
        var roles = new List<Role> { Role("Administrator", Raw), Role("Editor", "AccessAdminPanel", "EditContent", Raw) };
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom13Async();

        Assert.Equal(0, store.Updates);
        Assert.Equal(["Administrator", "Editor"], Holders(roles));
    }

    [Fact]
    public async Task UpdateFrom13_is_idempotent()
    {
        var roles = Roles();
        ApplyTheOriginalGrant(roles);
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom13Async();
        var updatesAfterFirstRun = store.Updates;
        await migrations.UpdateFrom13Async();

        Assert.Equal(4, updatesAfterFirstRun);
        Assert.Equal(updatesAfterFirstRun, store.Updates);
        Assert.Equal(Qualifying, Holders(roles));
    }

    [Fact]
    public async Task UpdateFrom13_changes_nothing_where_no_role_was_granted_it()
    {
        var roles = Roles();
        var (migrations, store) = Migrations(roles);

        Assert.Equal(14, await migrations.UpdateFrom13Async());

        Assert.Equal(0, store.Updates);
        Assert.Empty(Holders(roles));
    }

    [Fact]
    public async Task UpdateFrom12_then_13_on_a_tenant_running_both_for_the_first_time_revokes_nothing()
    {
        var roles = Roles();
        var (migrations, store) = Migrations(roles);

        await migrations.UpdateFrom12Async();
        var updatesAfterGrant = store.Updates;
        await migrations.UpdateFrom13Async();

        Assert.Equal(updatesAfterGrant, store.Updates);
        Assert.Equal(Qualifying, Holders(roles));
    }

    [Fact]
    public async Task Without_the_roles_services_both_steps_do_nothing()
    {
        var (migrations, _) = Migrations([], withRoles: false);

        Assert.Equal(13, await migrations.UpdateFrom12Async());
        Assert.Equal(14, await migrations.UpdateFrom13Async());
    }
}
