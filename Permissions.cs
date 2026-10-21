using OrchardCore.Security.Permissions;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks
{
    public sealed class Permissions : IPermissionProvider
    {
        /// <summary>
        /// Adding a raw HTML block, or changing the HTML of one. A raw block's HTML is rendered
        /// through Liquid and written to the page unencoded, so it can carry script, Liquid or a
        /// form posting anywhere: whoever holds this can put any markup on the public site.
        /// Without it the block editors keep raw blocks that are already there, unchanged, and
        /// allow them to be removed; see <see cref="Services.RawBlockEditGuard"/>.
        /// </summary>
        public static readonly Permission ManageRawBlocks = new("ManageRawBlocks", "Add or edit raw HTML blocks", isSecurityCritical: true);

        private readonly IEnumerable<Permission> _allPermissions = [ManageRawBlocks];

        public Task<IEnumerable<Permission>> GetPermissionsAsync() => Task.FromResult(_allPermissions);

        // Applied by OrchardCore when a role of that name is created, or when this feature is
        // first installed on a tenant. A tenant that already had the feature before this
        // permission existed gets it through Migrations.UpdateFrom12Async instead.
        public IEnumerable<PermissionStereotype> GetDefaultStereotypes() =>
        [
            new PermissionStereotype { Name = "Administrator", Permissions = _allPermissions },
            new PermissionStereotype { Name = "Editor", Permissions = _allPermissions },
        ];
    }
}
