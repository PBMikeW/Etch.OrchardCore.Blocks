using System.Linq.Expressions;
using System.Security.Claims;
using System.Text.Json.Nodes;
using Etch.OrchardCore.Blocks.Drivers;
using Etch.OrchardCore.Blocks.Fields;
using Etch.OrchardCore.Blocks.Models;
using Etch.OrchardCore.Blocks.Parsers;
using Etch.OrchardCore.Blocks.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Localization;
using Moq;
using OrchardCore.ContentManagement;
using OrchardCore.ContentManagement.Display.Models;
using OrchardCore.ContentManagement.Metadata.Models;
using OrchardCore.DisplayManagement;
using OrchardCore.DisplayManagement.Handlers;
using OrchardCore.DisplayManagement.Layout;
using OrchardCore.DisplayManagement.ModelBinding;
using OrchardCore.DisplayManagement.Zones;
using OrchardCore.Security;
using Xunit;
using static Etch.OrchardCore.Blocks.Tests.RawBlocksTests;

namespace Etch.OrchardCore.Blocks.Tests;

/// <summary>
/// The admin save path: BlockFieldDriver / BlockBodyPartDisplay UpdateAsync, with the posted Data and the
/// stored Data, as a user with or without the ManageRawBlocks permission.
/// </summary>
public class RawBlockSaveTests
{
    private const string StaffRaw = "<div class=\"staff\">embed</div>";

    private static readonly string Stored = Doc(Paragraph("p1", "Old text"), Raw("r1", StaffRaw));

    internal sealed class Harness
    {
        public Harness(bool canManageRawBlocks)
        {
            Authorization
                .Setup(a => a.AuthorizeAsync(It.IsAny<ClaimsPrincipal>(), It.IsAny<object>(), It.IsAny<IEnumerable<IAuthorizationRequirement>>()))
                .ReturnsAsync((ClaimsPrincipal _, object _, IEnumerable<IAuthorizationRequirement> requirements) =>
                {
                    var permission = requirements.OfType<PermissionRequirement>().Single().Permission.Name;
                    Checks.Add(permission);
                    return canManageRawBlocks && permission == Permissions.ManageRawBlocks.Name ? AuthorizationResult.Success() : AuthorizationResult.Failed();
                });

            var http = new HttpContextAccessor { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "agent")], "test")) } };
            Guard = new RawBlockEditGuard(Authorization.Object, http);
        }

        public Mock<IAuthorizationService> Authorization { get; } = new();

        public List<string> Checks { get; } = [];

        public RawBlockEditGuard Guard { get; }

        public BlockEditGuard EditGuard => new(Guard, Sanitizers.OrchardCore(), new Localizer<BlockEditGuard>());
    }

    /// <summary>Binds the posted Data as the admin form would.</summary>
    internal sealed class PostedData(string data) : IUpdateModel
    {
        public ModelStateDictionary ModelState { get; } = new();

        public Task<bool> TryUpdateModelAsync<TModel>(TModel model) where TModel : class => TryUpdateModelAsync(model, null);

        public Task<bool> TryUpdateModelAsync<TModel>(TModel model, string prefix) where TModel : class => TryUpdateModelAsync(model, prefix, []);

        public Task<bool> TryUpdateModelAsync<TModel>(TModel model, string prefix, params Expression<Func<TModel, object>>[] includeExpressions) where TModel : class
        {
            switch (model)
            {
                case BlockField field:
                    field.Data = data;
                    break;
                case BlockBodyPart part:
                    part.Data = data;
                    break;
            }

            return Task.FromResult(true);
        }

        public bool TryValidateModel(object model) => true;

        public bool TryValidateModel(object model, string prefix) => true;
    }

    internal static UpdateEditorContext EditorContext(IUpdateModel updater) =>
        new(Mock.Of<IShape>(), "", false, "", Mock.Of<IShapeFactory>(), Mock.Of<IZoneHolding>(), updater);

    internal static async Task<(BlockField Field, ModelStateDictionary ModelState)> SaveFieldAsync(Harness h, string stored, string posted)
    {
        var driver = new BlockFieldDriver(Mock.Of<IBlocksParser>(), h.EditGuard);
        var part = new ContentPart();
        var field = new BlockField { Data = stored };
        var partDefinition = new ContentPartDefinition("Content");
        var fieldDefinition = new ContentPartFieldDefinition(new ContentFieldDefinition("BlockField"), "Body", new JsonObject());
        fieldDefinition.PartDefinition = partDefinition;
        var typePart = new ContentTypePartDefinition("Content", partDefinition, new JsonObject());
        var updater = new PostedData(posted);

        await driver.UpdateAsync(field, updater, new UpdateFieldEditorContext(part, typePart, fieldDefinition, EditorContext(updater)));

        return (field, updater.ModelState);
    }

    internal sealed class Localizer<T> : IStringLocalizer<T>
    {
        public LocalizedString this[string name] => new(name, name);

        public LocalizedString this[string name, params object[] arguments] => new(name, string.Format(name, arguments));

        public IEnumerable<LocalizedString> GetAllStrings(bool includeParentCultures) => [];
    }

    // --- Without the permission ---

    [Fact]
    public async Task Without_the_permission_adding_a_raw_block_is_refused()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (_, modelState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", "Old text"), Raw("r1", StaffRaw), Raw("r2", "<script>alert(1)</script>")));

        Assert.False(modelState.IsValid);
        Assert.Contains("Add or edit raw HTML blocks", Assert.Single(modelState.Values.SelectMany(v => v.Errors)).ErrorMessage);
        Assert.Equal([Permissions.ManageRawBlocks.Name], h.Checks);
    }

    [Fact]
    public async Task Without_the_permission_a_raw_block_on_a_new_item_is_refused()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (_, modelState) = await SaveFieldAsync(h, null, Doc(Raw("r1", "<form action=\"https://example.test\"></form>")));

        Assert.False(modelState.IsValid);
    }

    [Fact]
    public async Task Without_the_permission_editing_an_existing_raw_block_is_refused()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (_, modelState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", "Old text"), Raw("r1", StaffRaw + "{{ 'x' }}")));

        Assert.False(modelState.IsValid);
    }

    [Fact]
    public async Task Without_the_permission_editing_other_blocks_keeps_the_existing_raw_block()
    {
        var h = new Harness(canManageRawBlocks: false);
        var posted = Doc(Paragraph("p1", "New text"), Paragraph("p2", "Another"), Raw("r1", StaffRaw));

        var (field, modelState) = await SaveFieldAsync(h, Stored, posted);

        Assert.True(modelState.IsValid);
        Assert.Equal(posted, field.Data);
        Assert.Equal([new RawBlock("r1", StaffRaw)], RawBlocks.Read(field.Data));
        Assert.Empty(h.Checks);
    }

    [Fact]
    public async Task Without_the_permission_deleting_a_raw_block_is_allowed()
    {
        var h = new Harness(canManageRawBlocks: false);
        var posted = Doc(Paragraph("p1", "Old text"));

        var (field, modelState) = await SaveFieldAsync(h, Stored, posted);

        Assert.True(modelState.IsValid);
        Assert.Equal(posted, field.Data);
    }

    [Fact]
    public async Task Without_the_permission_changed_data_that_cannot_be_read_is_refused()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (_, modelState) = await SaveFieldAsync(h, Stored, "{blocks:[{type:'raw',data:{html:'<script>x</script>'}}"); // unterminated

        Assert.False(modelState.IsValid);
    }

    [Fact]
    public async Task Without_the_permission_an_unchanged_field_is_not_checked()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (_, modelState) = await SaveFieldAsync(h, Stored, Stored);

        Assert.True(modelState.IsValid);
        Assert.Empty(h.Checks);
    }

    // --- With the permission ---

    [Fact]
    public async Task With_the_permission_adding_editing_and_deleting_raw_blocks_is_allowed()
    {
        var h = new Harness(canManageRawBlocks: true);

        var (added, addedState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", "Old text"), Raw("r1", StaffRaw), Raw("r2", "<script>ok()</script>")));
        var (_, editedState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", "Old text"), Raw("r1", "<div>changed</div>")));
        var (_, deletedState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", "Old text")));

        Assert.True(addedState.IsValid);
        Assert.True(editedState.IsValid);
        Assert.True(deletedState.IsValid);
        Assert.Equal(2, RawBlocks.Read(added.Data).Count);
    }

    // --- BlockBodyPart ---

    [Fact]
    public async Task The_block_body_part_applies_the_same_rule()
    {
        async Task<ModelStateDictionary> SavePartAsync(bool canManage, string posted)
        {
            var h = new Harness(canManage);
            var driver = new BlockBodyPartDisplay(Mock.Of<IBlocksParser>(), h.EditGuard);
            var part = new BlockBodyPart { Data = Stored };
            var typePart = new ContentTypePartDefinition("BlockBodyPart", new ContentPartDefinition("BlockBodyPart"), new JsonObject());
            var updater = new PostedData(posted);

            await driver.UpdateAsync(part, new UpdatePartEditorContext(typePart, EditorContext(updater)));

            return updater.ModelState;
        }

        var added = Doc(Paragraph("p1", "Old text"), Raw("r1", StaffRaw), Raw("r2", "<script>x</script>"));
        var keptRaw = Doc(Paragraph("p1", "Edited"), Raw("r1", StaffRaw));

        Assert.False((await SavePartAsync(false, added)).IsValid);
        Assert.True((await SavePartAsync(false, keptRaw)).IsValid);
        Assert.True((await SavePartAsync(true, added)).IsValid);
    }

    // --- The permission ---

    [Fact]
    public async Task The_permission_is_security_critical_and_defaults_to_administrators_and_editors()
    {
        var provider = new Permissions();

        Assert.Equal([Permissions.ManageRawBlocks], await provider.GetPermissionsAsync());
        Assert.Equal("ManageRawBlocks", Permissions.ManageRawBlocks.Name);
        Assert.True(Permissions.ManageRawBlocks.IsSecurityCritical);
        Assert.Equal(["Administrator", "Editor"], provider.GetDefaultStereotypes().Select(s => s.Name));
        Assert.DoesNotContain(provider.GetDefaultStereotypes(), s => s.Name == "Agents");
    }
}
