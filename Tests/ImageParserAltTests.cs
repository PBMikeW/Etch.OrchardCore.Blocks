using Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks;
using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Newtonsoft.Json;
using Xunit;

namespace Etch.OrchardCore.Blocks.Tests;

/// <summary>
/// ImageParser.GetAlt: what the image views receive as Model.Alt. Anything that is not real alt text comes out
/// empty, so the views fall back to the caption's text and then to alt="".
/// </summary>
public class ImageParserAltTests
{
    // Read the way Etch reads stored block content (Newtonsoft into Block).
    private static Block Image(string data) => JsonConvert.DeserializeObject<Block>("{\"type\":\"image\",\"data\":" + data + "}")!;

    [Theory]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"caption\":\"Cap\"}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":null}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":\"\"}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":\"   \"}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":\"\t\n\"}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":{\"text\":\"x\"}}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":[\"x\"]}")]
    [InlineData("{\"mediaPath\":\"a.jpg\",\"alt\":42}")]
    public void Missing_null_blank_or_non_text_alt_is_empty(string data)
        => Assert.Equal(string.Empty, ImageParser.GetAlt(Image(data)));

    [Fact]
    public void A_block_with_no_data_is_empty()
        => Assert.Equal(string.Empty, ImageParser.GetAlt(new Block { Type = "image" }));

    [Fact]
    public void Alt_text_comes_through_trimmed_and_otherwise_as_written()
    {
        Assert.Equal("A red front door", ImageParser.GetAlt(Image("{\"alt\":\"  A red front door \"}")));
        // Markup is just characters here: the views attribute-encode it.
        Assert.Equal("<b>x</b> & \"y\"", ImageParser.GetAlt(Image("{\"alt\":\"<b>x</b> & \\\"y\\\"\"}")));
    }
}
