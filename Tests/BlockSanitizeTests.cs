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
    private static readonly Func<string, string> Sanitize = BlockHtmlSanitizer.Instance.Sanitize;

    /// <summary>Markup that must not survive in any text property.</summary>
    private const string Injection =
        "<img src=x onerror=alert(1)><script>alert(2)</script><a href=\"javascript:alert(3)\">j</a>"
        + "<form action=\"https://evil.test\"><input name=p></form><iframe src=\"https://evil.test\"></iframe>"
        + "<div onclick=\"alert(4)\" style=\"background:url(javascript:alert(5))\">d</div>"
        + "<span style=\"position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999\">overlay</span>"
        + "<b style=\"background:url(https://evil.test/t.gif)\">track</b>"
        + "<input type=\"password\" name=\"pw\"><button>go</button><textarea>t</textarea><select><option>o</option></select>";

    private static readonly string[] Forbidden =
    [
        "onerror", "<script", "javascript:", "<form", "<iframe", "onclick", "alert(", "<img", "<div",
        "position", "z-index", "url(", "<input", "<button", "<textarea", "<select", "style=",
    ];

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
        Assert.Contains("overlay", html);
        Assert.Contains("<b>track</b>", html);
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
            + "<a href=\"https://www.pb.co.nz/x\" target=\"_blank\" rel=\"nofollow noopener noreferrer\">out</a> <a href=\"/about-us#team\">in</a> "
            + "<a href=\"mailto:a@pb.co.nz\">mail</a> <a href=\"tel:0800\">call</a> "
            + "<font style=\"color: rgb(239, 65, 35);\">red</font> <font color=\"#EF4123\">legacy red</font> "
            + "<mark style=\"background-color: rgb(255, 191, 0);\">hi</mark> "
            + "<span class=\"fontsize-tool\" style=\"font-size: 1.25rem;\">big</span> "
            + "<font style=\"color: rgb(0, 45, 106);\"><mark style=\"background-color: rgb(255, 191, 0);\"><span class=\"fontsize-tool\" style=\"font-size: 0.8rem;\">all three</span></mark></font> "
            + "&amp; &lt;tag&gt;&nbsp;x";

        var result = BlockTextSanitizer.Sanitize(null, Doc(Paragraph("p", formatted)), Sanitize);

        // Nothing to take out: the text is saved exactly as the editor wrote it (styles not re-serialised), so the
        // block isn't rewritten, and doesn't count as changed again on the next save.
        // (A new-tab link without noopener noreferrer is the one thing rewritten, once: see the next test.)
        Assert.Equal(formatted, Sanitize(formatted));
        Assert.False(result.Changed);
    }

    [Fact]
    public void A_new_tab_link_gets_noopener_noreferrer()
    {
        Assert.Equal("<a href=\"https://x.test/\" target=\"_blank\" rel=\"nofollow noopener noreferrer\">x</a>",
            Sanitize("<a href=\"https://x.test/\" target=\"_blank\" rel=\"nofollow\">x</a>"));
        Assert.Equal("<a href=\"https://x.test/\" target=\"_blank\" rel=\"noopener noreferrer\">x</a>",
            Sanitize("<a href=\"https://x.test/\" target=\"_blank\">x</a>"));
        Assert.Equal("<a href=\"https://x.test/\">x</a>", Sanitize("<a href=\"https://x.test/\">x</a>"));
    }

    [Theory]
    [InlineData("w")]
    [InlineData("_top")]
    [InlineData("_self")]
    [InlineData("_parent")]
    public void A_target_other_than_a_new_tab_is_removed(string target)
    {
        Assert.Equal("<a href=\"https://x.test/\">x</a>", Sanitize("<a href=\"https://x.test/\" target=\"" + target + "\">x</a>"));
    }

    [Theory]
    [InlineData("color: red", "color: red")]
    [InlineData("color: #EF4123;", "color: #EF4123;")]
    [InlineData("background-color: rgb(255, 191, 0); font-size: 1.25rem;", "background-color: rgb(255, 191, 0); font-size: 1.25rem;")]
    [InlineData("background-color: rgba(255, 191, 0, 0.5)", "background-color: rgba(255, 191, 0, 0.5)")]
    [InlineData("text-align: center", "text-align: center")]
    [InlineData("font-size: larger", "font-size: larger")]
    // Disallowed declarations go, the allowed ones beside them stay (rewritten as the browser writes them).
    [InlineData("box-sizing: border-box; color: rgb(0, 45, 106);", "color: rgb(0, 45, 106);")]
    [InlineData("color: red; z-index: 9999", "color: red;")]
    [InlineData("position:fixed;top:0;color:#fff;background:url(https://evil.test/t.gif);font-size:2rem", "color: #fff; font-size: 2rem;")]
    [InlineData("color: url(https://evil.test/t.gif); background-color: red", "background-color: red;")]
    // Nothing allowed: no style at all.
    [InlineData("position: fixed", null)]
    [InlineData("background: url(https://evil.test/t.gif)", null)]
    [InlineData("background-color: url(https://evil.test/t.gif)", null)]
    [InlineData("color: expression(alert(1))", null)]
    [InlineData("font-size: calc(100vh)", null)]
    [InlineData("display: block", null)]
    [InlineData("color", null)]
    [InlineData("", null)]
    // Can't be split safely: dropped whole.
    [InlineData("color: red /* x */", null)]
    [InlineData("color: \\72 ed", null)]
    public void Only_colour_size_and_alignment_declarations_are_kept(string style, string expected)
    {
        Assert.Equal(expected, BlockHtmlSanitizer.FilterStyle(style));
        Assert.Equal(expected != null && expected == style, BlockHtmlSanitizer.IsSafeStyle(style));

        var html = Sanitize("<span style=\"" + style + "\">x</span>");
        Assert.Equal(expected != null ? "<span style=\"" + expected + "\">x</span>" : "<span>x</span>", html);
    }

    [Fact]
    public void The_agent_starter_header_colour_survives()
    {
        const string header = "<font style=\"box-sizing: border-box; color: rgb(0, 45, 106);\">Welcome</font>";

        Assert.Equal("<font style=\"color: rgb(0, 45, 106);\">Welcome</font>", Sanitize(header));
    }

    [Theory]
    [InlineData("<span data-pb-block-kept-style=\"position:fixed;z-index:9\">x</span>", "<span>x</span>")]
    [InlineData("<span data-pb-block-kept-style=\"position:fixed\" style=\"color: red\">x</span>", "<span style=\"color: red\">x</span>")]
    [InlineData("<span style=\"color: red\" data-pb-block-kept-style=\"position:fixed\">x</span>", "<span style=\"color: red\">x</span>")]
    [InlineData("<span style=\"color: red\" data-anything=\"position:fixed\">x</span>", "<span style=\"color: red\">x</span>")]
    public void No_attribute_in_the_input_can_carry_a_style_in_or_lose_a_kept_one(string html, string expected)
    {
        Assert.Equal(expected, Sanitize(html));
    }

    [Fact]
    public void Only_the_font_size_class_is_kept()
    {
        Assert.Equal("<span class=\"fontsize-tool\">x</span>", Sanitize("<span class=\"fontsize-tool position-fixed vh-100\">x</span>"));
        Assert.Equal("<span>x</span>", Sanitize("<span class=\"fixed-top\">x</span>"));
    }

    [Theory]
    [InlineData("<input type=\"password\">", "ok")]
    [InlineData("<button>x</button>", "okx")]
    [InlineData("<form action=\"https://evil.test\"><input name=\"p\">x</form>", "okx")]
    [InlineData("<img src=\"https://x.test/a.png\">", "ok")]
    [InlineData("<code>x</code>", "okx")]
    [InlineData("<p>x</p>", "okx")]
    [InlineData("<div style=\"position:fixed;z-index:9;background:url(https://evil.test/t.gif)\">x</div>", "okx")]
    [InlineData("<div><p><b>x</b> y</p></div>", "ok<b>x</b> y")]
    public void Other_elements_are_removed_and_their_text_kept(string html, string expected)
    {
        Assert.Equal(expected, Sanitize("ok" + html));
    }

    [Theory]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("<style>body{display:none}</style>")]
    [InlineData("<svg><a href=\"javascript:alert(1)\"><text>x</text></a></svg>")]
    [InlineData("<math><mi>x</mi></math>")]
    [InlineData("<template><img src=x onerror=alert(1)></template>")]
    [InlineData("<noscript><b>x</b></noscript>")]
    [InlineData("<iframe src=\"https://x.test\">x</iframe>")]
    [InlineData("<object data=\"https://x.test/x.swf\">x</object>")]
    [InlineData("<textarea>x</textarea>")]
    [InlineData("<select><option>x</option></select>")]
    public void Some_elements_are_removed_with_their_content(string html)
    {
        Assert.Equal("ok", Sanitize("ok" + html));
    }

    [Theory]
    [InlineData("<div><img src=x onerror=alert(1)><script>alert(2)</script>t</div>", "t")]
    [InlineData("<p><a href=\"javascript:alert(1)\" onclick=\"alert(2)\">t</a></p>", "<a>t</a>")]
    [InlineData("<div><div><span style=\"position:fixed\" onmouseover=\"alert(1)\">t</span></div></div>", "<span>t</span>")]
    [InlineData("<form><select><option>a</option></select><button formaction=\"https://evil.test\">t</button></form>", "t")]
    [InlineData("<p><iframe srcdoc=\"<script>alert(1)</script>\"></iframe>t</p>", "t")]
    public void A_dangerous_child_of_a_removed_element_is_sanitised_too(string html, string expected)
    {
        Assert.Equal(expected, Sanitize(html));
    }

    [Fact]
    public void The_tenant_sanitiser_is_not_changed()
    {
        // The block sanitiser is its own instance: no tenant-wide ConfigureHtmlSanitizer from this module.
        var startup = File.ReadAllText(Path.Combine(ViewsFolder(), "..", "Startup.cs"));

        Assert.DoesNotContain("ConfigureHtmlSanitizer", startup);
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

    [Fact]
    public void No_view_writes_a_tune_through_Html_Raw()
    {
        // The anchor, alignment and padding tunes go into attributes: written as id="@x" / style="@x" (or through a
        // TagBuilder) they are encoded; through Html.Raw they are not. The views used to build them with Html.Raw.
        var views = Directory.GetFiles(ViewsFolder(), "*.cshtml");
        Assert.NotEmpty(views);

        foreach (var view in views)
        {
            foreach (var line in File.ReadAllLines(view))
            {
                Assert.False(
                    System.Text.RegularExpressions.Regex.IsMatch(line, @"Html\.Raw\([^\n]*(anchor|alignment|padding)", System.Text.RegularExpressions.RegexOptions.IgnoreCase),
                    $"{Path.GetFileName(view)}: {line.Trim()}");
            }
        }
    }

    private static string ViewsFolder([CallerFilePath] string here = "") => Path.Combine(Path.GetDirectoryName(here)!, "..", "Views");
}
