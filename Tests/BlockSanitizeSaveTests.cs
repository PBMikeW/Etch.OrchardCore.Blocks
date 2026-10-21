using Etch.OrchardCore.Blocks.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Xunit;
using static Etch.OrchardCore.Blocks.Tests.RawBlocksTests;
using static Etch.OrchardCore.Blocks.Tests.RawBlockSaveTests;

namespace Etch.OrchardCore.Blocks.Tests;

/// <summary>The admin save path (BlockFieldDriver.UpdateAsync) with block text and embeds, with and without ManageRawBlocks.</summary>
public class BlockSanitizeSaveTests
{
    private const string Injected = "<img src=x onerror=alert(1)>Hello <b>there</b>";

    private static readonly string Stored = Doc(Paragraph("p1", "Old text"));

    [Fact]
    public async Task Without_the_permission_injected_text_is_saved_sanitised()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (field, modelState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", Injected)));

        Assert.True(modelState.IsValid);
        var text = (string)JObject.Parse(field.Data).SelectToken("$.blocks[0].data.text")!;
        Assert.DoesNotContain("onerror", text);
        Assert.Contains("Hello <b>there</b>", text);
        Assert.Equal([Permissions.ManageRawBlocks.Name], h.Checks);
    }

    [Fact]
    public async Task With_the_permission_the_text_is_saved_as_posted()
    {
        var h = new Harness(canManageRawBlocks: true);
        var posted = Doc(Paragraph("p1", Injected));

        var (field, modelState) = await SaveFieldAsync(h, Stored, posted);

        Assert.True(modelState.IsValid);
        Assert.Equal(posted, field.Data);
    }

    [Fact]
    public async Task Without_the_permission_clean_edits_save_as_posted_with_no_permission_check()
    {
        var h = new Harness(canManageRawBlocks: false);
        var posted = Doc(Paragraph("p1", "New <i>text</i>"), Paragraph("p2", "<a href=\"https://www.pb.co.nz\">More</a>"));

        var (field, modelState) = await SaveFieldAsync(h, Stored, posted);

        Assert.True(modelState.IsValid);
        Assert.Equal(posted, field.Data);
        Assert.Empty(h.Checks);
    }

    [Fact]
    public async Task Without_the_permission_an_embed_from_elsewhere_is_refused()
    {
        var h = new Harness(canManageRawBlocks: false);
        var embed = JsonConvert.SerializeObject(new { id = "e", type = "embed", data = new { service = "youtube", embed = "https://evil.test/x" } });

        var (_, modelState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", "Old text"), embed));

        Assert.False(modelState.IsValid);
        Assert.Contains("YouTube, Vimeo or Twitch", Assert.Single(modelState.Values.SelectMany(v => v.Errors)).ErrorMessage);
    }

    [Fact]
    public async Task Without_the_permission_a_raw_block_and_injected_text_are_both_reported()
    {
        var h = new Harness(canManageRawBlocks: false);

        var (field, modelState) = await SaveFieldAsync(h, Stored, Doc(Paragraph("p1", Injected), Raw("r1", "<script>x</script>")));

        Assert.False(modelState.IsValid);
        Assert.Contains("raw HTML", Assert.Single(modelState.Values.SelectMany(v => v.Errors)).ErrorMessage);
        Assert.DoesNotContain("onerror", field.Data);
    }

    [Fact]
    public async Task Without_the_permission_a_legacy_block_left_alone_is_kept()
    {
        var h = new Harness(canManageRawBlocks: false);
        var legacy = Paragraph("old", "<span onmouseover=\"x()\">staff</span>");

        var (field, modelState) = await SaveFieldAsync(h, Doc(legacy, Paragraph("p1", "Old text")), Doc(legacy, Paragraph("p1", "Edited")));

        Assert.True(modelState.IsValid);
        Assert.Contains("onmouseover", field.Data);
    }
}
