using System.Dynamic;
using System.Runtime.CompilerServices;
using Etch.OrchardCore.Blocks.EditorJS.Parsers;
using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Xunit;
using static Etch.OrchardCore.Blocks.Tests.RawBlocksTests;

namespace Etch.OrchardCore.Blocks.Tests;

/// <summary>
/// Block text and tunes: text in new and changed blocks is sanitised on save for users without ManageRawBlocks, embeds
/// are kept to the supported services, and the anchor and alignment tunes are validated when rendering.
/// </summary>
public class BlockSanitizeTests
{
    private static readonly Func<string, string> Sanitize = Sanitizers.OrchardCore().Sanitize;

    /// <summary>Markup that must not survive in any text property.</summary>
    private const string Injection =
        "<img src=x onerror=alert(1)><script>alert(2)</script><a href=\"javascript:alert(3)\">j</a>"
        + "<form action=\"https://evil.test\"><input name=p></form><iframe src=\"https://evil.test\"></iframe>"
        + "<div onclick=\"alert(4)\" style=\"background:url(javascript:alert(5))\">d</div>";

    private static readonly string[] Forbidden = ["onerror", "<script", "javascript:", "<form", "<iframe", "onclick", "alert("];

    private static string Block(string id, string type, object data) => JsonConvert.SerializeObject(new { id, type, data });

    private static string Json(string s) => JsonConvert.SerializeObject(s);

    private static JObject Saved(BlockSanitizeResult result) => JObject.Parse(result.Data);

    private static void AssertClean(string html)
    {
        foreach (var bad in Forbidden)
        {
            Assert.DoesNotContain(bad, html, StringComparison.OrdinalIgnoreCase);
        }
    }

    // --- Each text property ---

    public static TheoryData<string, string> TextProperties => new()
    {
        { Block("b", "paragraph", new { text = Injection }), "$.blocks[0].data.text" },
        { Block("b", "header", new { text = Injection, level = 2 }), "$.blocks[0].data.text" },
        { Block("b", "list", new { style = "unordered", items = new[] { "fine", Injection } }), "$.blocks[0].data.items[1]" },
        { Block("b", "quote", new { text = Injection, caption = "c", alignment = "left" }), "$.blocks[0].data.text" },
        { Block("b", "quote", new { text = "t", caption = Injection, alignment = "left" }), "$.blocks[0].data.caption" },
        { Block("b", "image", new { mediaPath = "a.jpg", caption = Injection }), "$.blocks[0].data.caption" },
        { Block("b", "embed", new { service = "youtube", embed = "https://www.youtube.com/embed/abc", caption = Injection }), "$.blocks[0].data.caption" },
        { Block("b", "table", new { withHeadings = false, content = new[] { new[] { "a", Injection } } }), "$.blocks[0].data.content[0][1]" },
        { Columns("b", [Paragraph("n", Injection)]), "$.blocks[0].data.columns[0].blocks[0].data.text" },
    };

    [Theory]
    [MemberData(nameof(TextProperties))]
    public void Injection_in_each_text_property_of_a_new_block_is_sanitised(string block, string path)
    {
        var result = BlockTextSanitizer.Sanitize(Doc(Paragraph("p0", "x")), Doc(block), Sanitize);

        Assert.True(result.Changed);
        Assert.Empty(result.Refusals);
        var html = (string)Saved(result).SelectToken(path)!;
        AssertClean(html);
        Assert.Contains("<img src=\"x\">", html);
    }

    [Fact]
    public void A_text_value_that_is_not_a_string_is_replaced_by_its_text_sanitised()
    {
        // Block.Get renders a non-string value by its JSON text.
        var result = BlockTextSanitizer.Sanitize(null, Doc(Block("b", "paragraph", new { text = new { x = Injection } })), Sanitize);

        var text = Saved(result).SelectToken("$.blocks[0].data.text")!;
        Assert.Equal(JTokenType.String, text.Type);
        AssertClean((string)text!);
    }

    [Fact]
    public void Key_case_and_duplicates_are_read_as_the_renderer_reads_them()
    {
        // Newtonsoft binds "Type" / "Data" ignoring case, the last duplicate winning: what is stored is that reading.
        var data = "{\"blocks\":[{\"id\":\"b\",\"type\":\"header\",\"Type\":\"paragraph\",\"data\":{\"text\":\"ok\"},\"Data\":{\"text\":" + Json(Injection) + "}}]}";

        var result = BlockTextSanitizer.Sanitize(null, data, Sanitize);

        var block = Saved(result).SelectToken("$.blocks[0]")!;
        Assert.Equal("paragraph", (string)block["type"]!);
        AssertClean((string)block.SelectToken("data.text")!);
        Assert.Null(block["Data"]);
    }

    // --- What survives ---

    [Fact]
    public void Inline_formatting_the_editor_writes_survives()
    {
        const string formatted =
            "<b>bold</b> <i>italic</i> <u>under</u> <strong>strong</strong> <em>em</em><br>"
            + "<a href=\"https://www.pb.co.nz/x\" target=\"_blank\" rel=\"nofollow\">out</a> <a href=\"/about-us#team\">in</a> "
            + "<a href=\"mailto:a@pb.co.nz\">mail</a> <a href=\"tel:0800\">call</a> "
            + "<font color=\"#EF4123\">red</font> <mark class=\"cdx-marker\" style=\"background-color: rgb(255, 191, 0)\">hi</mark> "
            + "<span class=\"fontsize-tool\" style=\"font-size: 1.25rem\">big</span> <code class=\"inline-code\">c</code> &amp; &lt;tag&gt;";

        var result = BlockTextSanitizer.Sanitize(null, Doc(Paragraph("p", formatted)), Sanitize);
        var text = (string)Saved(result).SelectToken("$.blocks[0].data.text")!;

        foreach (var kept in new[]
        {
            "<b>bold</b>", "<i>italic</i>", "<u>under</u>", "<strong>strong</strong>", "<em>em</em>", "<br>",
            "href=\"https://www.pb.co.nz/x\"", "target=\"_blank\"", "rel=\"nofollow\"", "href=\"/about-us#team\"",
            "href=\"mailto:a@pb.co.nz\"", "href=\"tel:0800\"",
            "<font color=\"#EF4123\">red</font>", "class=\"cdx-marker\"", "background-color: rgba(255, 191, 0, 1)",
            "class=\"fontsize-tool\"", "font-size: 1.25rem", "<code class=\"inline-code\">c</code>", "&amp; &lt;tag&gt;",
        })
        {
            Assert.Contains(kept, text);
        }
    }

    [Theory]
    [InlineData("vbscript:msgbox(1)")]
    [InlineData("data:text/html,x")]
    [InlineData("file:///c:/x")]
    public void Link_schemes_other_than_http_https_mailto_and_tel_are_stripped(string href)
    {
        var text = (string)Saved(BlockTextSanitizer.Sanitize(null, Doc(Paragraph("p", "<a href=\"" + href + "\">x</a>")), Sanitize)).SelectToken("$.blocks[0].data.text")!;

        Assert.Equal("<a>x</a>", text);
    }

    [Fact]
    public void Clean_text_is_saved_exactly_as_posted()
    {
        var posted = Doc(Paragraph("p0", "x"), Paragraph("p1", "<b>new</b> text"));

        var result = BlockTextSanitizer.Sanitize(Doc(Paragraph("p0", "x")), posted, Sanitize);

        Assert.False(result.Changed);
        Assert.Same(posted, result.Data);
    }

    // --- Unchanged blocks ---

    [Fact]
    public void Unchanged_blocks_are_left_exactly_as_they_were_whatever_they_hold()
    {
        // Content written before sanitising (or by staff) keeps saving: only new and changed blocks are touched.
        var legacy = Block("old", "paragraph", new { text = "<p onclick=\"x()\">staff markup</p>" });
        var before = Doc(legacy, Paragraph("p1", "old"));
        var after = Doc(legacy, Paragraph("p1", "<img src=x onerror=alert(1)>"));

        var result = BlockTextSanitizer.Sanitize(before, after, Sanitize);

        Assert.True(result.Changed);
        Assert.Equal("<p onclick=\"x()\">staff markup</p>", (string)Saved(result).SelectToken("$.blocks[0].data.text")!);
        AssertClean((string)Saved(result).SelectToken("$.blocks[1].data.text")!);
    }

    [Fact]
    public void A_block_moved_into_columns_is_unchanged()
    {
        var legacy = Block("old", "paragraph", new { text = "<p onclick=\"x()\">staff</p>" });

        var result = BlockTextSanitizer.Sanitize(Doc(legacy), Doc(Columns("c", [legacy])), Sanitize);

        Assert.False(result.Changed);
    }

    [Fact]
    public void Unreadable_data_is_reported_not_sanitised()
    {
        Assert.True(BlockTextSanitizer.Sanitize(null, "{\"blocks\": [", Sanitize).Unreadable);
    }

    // --- Embeds and inline SVG icons ---

    [Theory]
    [InlineData("youtube", "https://www.youtube.com/embed/abc123")]
    [InlineData("youtube", "https://www.youtube-nocookie.com/embed/abc123")]
    [InlineData("vimeo", "https://player.vimeo.com/video/123?title=0&byline=0")]
    [InlineData("twitch-channel", "https://player.twitch.tv/?channel=pb")]
    [InlineData("twitch-video", "https://player.twitch.tv/?video=v123")]
    public void An_embed_from_a_supported_service_is_allowed(string service, string embed)
    {
        var result = BlockTextSanitizer.Sanitize(null, Doc(Block("e", "embed", new { service, embed, caption = "" })), Sanitize);

        Assert.Empty(result.Refusals);
    }

    [Theory]
    [InlineData("youtube", "https://evil.test/embed/abc")]
    [InlineData("youtube", "http://www.youtube.com/embed/abc")]
    [InlineData("youtube", "javascript:alert(1)")]
    [InlineData("youtube", "java\tscript:alert(1)")]
    [InlineData("youtube", "data:text/html,<script>alert(1)</script>")]
    [InlineData("youtube", "https://user@www.youtube.com/embed/abc")]
    [InlineData("youtube", "https://www.youtube.com:8443/embed/abc")]
    [InlineData("vimeo", "https://www.youtube.com/embed/abc")]
    [InlineData("instagram", "https://www.instagram.com/p/abc/embed")]
    [InlineData(null, "https://www.youtube.com/embed/abc")]
    public void An_embed_from_anywhere_else_is_refused(string service, string embed)
    {
        var result = BlockTextSanitizer.Sanitize(null, Doc(Block("e", "embed", new { service, embed })), Sanitize);

        Assert.Equal([BlockRefusal.EmbedSource], result.Refusals);
    }

    [Fact]
    public void An_unchanged_embed_from_another_service_is_kept()
    {
        var legacy = Block("e", "embed", new { service = "codepen", embed = "https://codepen.io/x/embed/y" });

        var result = BlockTextSanitizer.Sanitize(Doc(legacy), Doc(legacy, Paragraph("p", "new")), Sanitize);

        Assert.Empty(result.Refusals);
    }

    [Fact]
    public void A_new_inline_svg_button_icon_is_refused_and_one_already_there_is_kept()
    {
        const string svg = "<svg onload=\"alert(1)\"></svg>";
        var stored = Block("k", "kbButton", new { label = "Go", url = "/go", iconSvg = svg });

        var added = BlockTextSanitizer.Sanitize(null, Doc(stored), Sanitize);
        var relabelled = BlockTextSanitizer.Sanitize(Doc(stored), Doc(Block("k", "kbButton", new { label = "Go now", url = "/go", iconSvg = svg })), Sanitize);
        var named = BlockTextSanitizer.Sanitize(null, Doc(Block("k", "kbButton", new { label = "Go", url = "/go", iconName = "arrow-right" })), Sanitize);

        Assert.Equal([BlockRefusal.InlineSvgIcon], added.Refusals);
        Assert.Empty(relabelled.Refusals);
        Assert.Empty(named.Refusals);
    }

    // --- Tunes, at render ---

    [Theory]
    [InlineData("team", "team")]
    [InlineData("Our_Team-2", "Our_Team-2")]
    [InlineData("x\" onmouseover=\"alert(1)", null)]
    [InlineData("a b", null)]
    [InlineData("<b>", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Only_a_slug_anchor_reaches_a_view(string anchor, string expected)
    {
        Assert.Equal(expected, BlockTunes.SafeAnchor(anchor));
    }

    [Theory]
    [InlineData("left", "left")]
    [InlineData("center", "center")]
    [InlineData("right", "right")]
    [InlineData("justify", "justify")]
    [InlineData("left;background:url(https://evil.test/x)", null)]
    [InlineData("left\" onmouseover=\"alert(1)", null)]
    [InlineData("Center", null)]
    [InlineData(null, null)]
    public void Only_a_known_alignment_reaches_a_view(string alignment, string expected)
    {
        Assert.Equal(expected, BlockTunes.SafeAlignment(alignment));
    }

    [Fact]
    public void ApplyTunes_passes_safe_tunes_to_the_shape_and_drops_the_rest()
    {
        static Block WithTunes(string anchor, string alignment) => JsonConvert.DeserializeObject<Block>(JsonConvert.SerializeObject(new
        {
            type = "paragraph",
            data = new { text = "t" },
            tunes = new { anchorTune = new { anchor }, alignmentTune = new { alignment }, paddingTune = new { paddingTop = "md" } },
        }))!;

        dynamic safe = new ExpandoObject();
        BlocksParser.ApplyTunes(safe, WithTunes("team", "center"));
        dynamic unsafeTunes = new ExpandoObject();
        BlocksParser.ApplyTunes(unsafeTunes, WithTunes("x\"><script>alert(1)</script>", "left;color:red"));

        Assert.Equal("team", (string)safe.Anchor);
        Assert.Equal("center", (string)safe.TextAlignment);
        Assert.Equal("md", (string)safe.PaddingTop);
        var dropped = (IDictionary<string, object>)unsafeTunes;
        Assert.False(dropped.ContainsKey("Anchor"));
        Assert.False(dropped.ContainsKey("TextAlignment"));
    }

    [Theory]
    [InlineData("https://www.youtube.com/embed/abc", "https://www.youtube.com/embed/abc")]
    [InlineData("https://codepen.io/x/embed/y", "https://codepen.io/x/embed/y")]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("data:text/html,x", null)]
    [InlineData("http://www.youtube.com/embed/abc", null)]
    [InlineData("//evil.test/x", null)]
    [InlineData(" java\nscript:alert(1)", null)]
    public void An_embed_renders_only_an_https_source(string url, string expected)
    {
        Assert.Equal(expected, EmbedSources.SafeSourceUrl(url));
    }

    [Theory]
    [InlineData("BlockField.cshtml")]
    [InlineData("BlockBodyPart.cshtml")]
    [InlineData("Block-Paragraph.cshtml")]
    public void The_views_write_tune_attributes_encoded(string view)
    {
        // Razor encodes an attribute value written as id="@x" / style="@x"; the views used to build these with Html.Raw.
        var source = File.ReadAllText(Path.Combine(ViewsFolder(), view));

        Assert.DoesNotContain("Html.Raw($\" id=", source);
        Assert.DoesNotContain("Html.Raw($\" style=", source);
    }

    private static string ViewsFolder([CallerFilePath] string here = "") => Path.Combine(Path.GetDirectoryName(here)!, "..", "Views");
}
