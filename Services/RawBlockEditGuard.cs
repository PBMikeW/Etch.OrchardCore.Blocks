using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using OrchardCore.Security.Permissions;
using System;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>
    /// Server-side check for the block editors' saves: a save that adds a raw HTML block, or
    /// changes one's HTML, needs <see cref="Permissions.ManageRawBlocks"/>. Raw blocks the content
    /// already had are kept when they are left as they were, and may be removed, by anyone who can
    /// edit the content. Hiding the raw tool in the editor is only cosmetic; this is what stops a
    /// hand-made request.
    /// </summary>
    public class RawBlockEditGuard
    {
        private readonly IAuthorizationService _authorizationService;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public RawBlockEditGuard(IAuthorizationService authorizationService, IHttpContextAccessor httpContextAccessor)
        {
            _authorizationService = authorizationService;
            _httpContextAccessor = httpContextAccessor;
        }

        /// <summary>Whether the current user holds <see cref="Permissions.ManageRawBlocks"/>.</summary>
        public async Task<bool> CanManageRawBlocksAsync()
        {
            var user = _httpContextAccessor.HttpContext?.User;

            return user != null && await _authorizationService.AuthorizeAsync(user, Permissions.ManageRawBlocks);
        }

        /// <summary>
        /// Whether the current user may save <paramref name="after"/> over <paramref name="before"/>
        /// (the stored block data). True when the data is unchanged, when it adds and changes no raw
        /// block (<see cref="RawBlocks.FindNewOrChanged"/>), or when the user holds
        /// <see cref="Permissions.ManageRawBlocks"/>. Data that changed and can't be read is treated
        /// as adding a raw block (the page would fail to render it anyway).
        /// </summary>
        public async Task<bool> CanSaveAsync(string before, string after)
        {
            if (string.Equals(before ?? string.Empty, after ?? string.Empty, StringComparison.Ordinal))
            {
                return true;
            }

            bool addsRawHtml;
            try
            {
                addsRawHtml = RawBlocks.FindNewOrChanged(before, after).Count > 0;
            }
            catch (Exception)
            {
                addsRawHtml = true;
            }

            return !addsRawHtml || await CanManageRawBlocksAsync();
        }
    }
}
