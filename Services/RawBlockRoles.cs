using System;
using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>
    /// Which existing roles Migrations.UpdateFrom12Async grants <see cref="Permissions.ManageRawBlocks"/> to, and which
    /// ones UpdateFrom13Async takes it back from: one rule for both steps. A role qualifies when it can reach the admin
    /// (AccessAdminPanel), can edit all content (EditContent, or PublishContent; not the "Own" variants, which an agent's
    /// or customer's role carries), and is not one of the roles below. The administrator role is not decided here: it
    /// holds every permission through OrchardCore's admin bypass, so both steps leave it alone.
    /// </summary>
    public static class RawBlockRoles
    {
        /// <summary>
        /// Roles that never get raw HTML from a migration, whatever else they hold. Anonymous and Authenticated are
        /// applied to every visitor and every signed-in user by OrchardCore's RolesPermissionsHandler; Registered Users
        /// is the www customer role; Agents and Project editor are the type-scoped roles on agent and project sites.
        /// An administrator can still grant it to one of these by hand in Security > Roles.
        /// </summary>
        public static readonly IReadOnlySet<string> NeverGranted = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Anonymous",
            "Authenticated",
            "Registered Users",
            "Agents",
            "Project editor",
        };

        /// <summary>
        /// Whether a role (not the administrator role) qualifies for raw HTML blocks; <paramref name="reason"/> says
        /// why, for the migration log. <paramref name="permissions"/> should compare case-insensitively.
        /// </summary>
        public static bool Qualifies(string roleName, IReadOnlySet<string> permissions, out string reason)
        {
            if (NeverGranted.Contains(roleName))
            {
                reason = "it is on the never-granted list";
                return false;
            }

            if (!permissions.Contains("AccessAdminPanel"))
            {
                reason = "it does not have AccessAdminPanel";
                return false;
            }

            if (!permissions.Contains("EditContent") && !permissions.Contains("PublishContent"))
            {
                reason = "it cannot edit all content (no EditContent or PublishContent)";
                return false;
            }

            reason = "it has AccessAdminPanel and can edit all content";
            return true;
        }
    }
}
