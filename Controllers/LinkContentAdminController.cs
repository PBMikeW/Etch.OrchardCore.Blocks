﻿using Etch.OrchardCore.Blocks.Services;
using Etch.OrchardCore.Blocks.Settings;
using Microsoft.AspNetCore.Mvc;
using OrchardCore.Admin;
using OrchardCore.ContentManagement.Metadata;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Controllers
{
    [Admin]
    public class LinkContentAdminController : Controller
    {
        #region Dependencies

        private readonly IContentDefinitionManager _contentDefinitionManager;
        private readonly IContentSearchResultsProvider _contentSearchResultsProvider;

        #endregion

        #region Constructor

        public LinkContentAdminController(IContentDefinitionManager contentDefinitionManager, IContentSearchResultsProvider contentSearchResultsProvider)
        {
            _contentDefinitionManager = contentDefinitionManager;
            _contentSearchResultsProvider = contentSearchResultsProvider;
        }

        #endregion

        #region Actions

        public async Task<IActionResult> SearchContentItems(string type, string part, string field, string query)
        {
            if (string.IsNullOrWhiteSpace(part))
            {
                return BadRequest("Part is required parameter");
            }

            try
            {
                return new ObjectResult(await _contentSearchResultsProvider.SearchAsync(new ContentSearchContext
                {
                    ContentTypes = await GetLinkableTypes(type, part, field),
                    Query = query
                }));
            } 
            catch (Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }

        #endregion

        #region Private Methods

        private async Task <string[]> GetLinkableTypes(string type, string part, string field)
        {
            if (!string.IsNullOrEmpty(field))
            {
                return await GetLinkableTypesFromFieldDefinition(part, field);
            }

            return await GetLinkableTypesFromPartDefinition(type, part);
        }

        private async Task<string[]> GetLinkableTypesFromPartDefinition(string type, string part)
        {
            var typeDefinition = await _contentDefinitionManager.GetTypeDefinitionAsync(type);

            var contentTypePartDefinition = typeDefinition.Parts.FirstOrDefault(p => p.Name == part);

            if (contentTypePartDefinition == null)
            {
                throw new Exception("Unable to find part definition");
            }

            return contentTypePartDefinition.GetSettings<BlockBodyPartSettings>()?.LinkableContentTypes ?? Array.Empty<string>();
        }

        private async Task<string[]> GetLinkableTypesFromFieldDefinition(string part, string field)
        {
            var partFieldDefinition = (await _contentDefinitionManager.GetPartDefinitionAsync(part))?.Fields
               .FirstOrDefault(f => f.Name == field);

            var fieldSettings = partFieldDefinition?.GetSettings<BlockFieldSettings>();

            if (fieldSettings == null)
            {
                throw new Exception("Unable to find field definition");
            }

            return fieldSettings.LinkableContentTypes;
        }

        #endregion
    }
}
