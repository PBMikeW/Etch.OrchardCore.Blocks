using Etch.OrchardCore.Blocks.Services;
using Xunit;

namespace Etch.OrchardCore.Blocks.Tests;

public class RawBlocksTests
{
    private static string Json(string value) => System.Text.Json.JsonSerializer.Serialize(value);

    internal static string Doc(params string[] blocks) => "{\"time\":1,\"blocks\":[" + string.Join(",", blocks) + "],\"version\":\"2.31.6\"}";

    internal static string Raw(string id, string html) => "{\"id\":" + Json(id) + ",\"type\":\"raw\",\"data\":{\"html\":" + Json(html) + "}}";

    internal static string Paragraph(string id, string text) => "{\"id\":" + Json(id) + ",\"type\":\"paragraph\",\"data\":{\"text\":" + Json(text) + "}}";

    internal static string Columns(string id, params string[][] columns) =>
        "{\"id\":" + Json(id) + ",\"type\":\"columns\",\"data\":{\"columnCount\":" + columns.Length + ",\"columns\":["
        + string.Join(",", columns.Select(c => "{\"blocks\":[" + string.Join(",", c) + "]}")) + "]}}";

    [Fact]
    public void Read_finds_top_level_and_nested_raw_blocks_in_document_order()
    {
        var data = Doc(
            Paragraph("p1", "hello"),
            Raw("r1", "<div>one</div>"),
            Columns("c1", [Raw("r2", "<b>two</b>")], [Paragraph("p2", "x"), Columns("c2", [Raw("r3", "three")])]));

        var found = RawBlocks.Read(data);

        Assert.Equal(
            [new RawBlock("r1", "<div>one</div>"), new RawBlock("r2", "<b>two</b>"), new RawBlock("r3", "three")],
            found);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("null")]
    [InlineData("""{"time":1}""")]
    public void Read_finds_nothing_in_empty_data(string data)
    {
        Assert.Empty(RawBlocks.Read(data));
    }

    [Fact]
    public void Read_matches_the_type_and_the_column_keys_ignoring_case_and_counts_a_non_string_html_by_its_text()
    {
        var data = """
            {"blocks":[
              {"id":"a","type":"RAW","data":{"html":"<i>a</i>"}},
              {"id":"b","Type":"raw","Data":{"html":{"x":"<script>1</script>"}}},
              {"id":"c","type":"Columns","data":{"Columns":[{"Blocks":[{"id":"d","type":"raw","data":{"html":"d"}}]}]}}
            ]}
            """;

        var found = RawBlocks.Read(data);

        Assert.Equal(["a", "b", "d"], found.Select(b => b.Id));
        Assert.Contains("<script>1</script>", found[1].Html);
    }

    [Fact]
    public void Read_reads_lenient_json_as_the_renderer_does()
    {
        // Newtonsoft (what BlocksParser renders with) takes single quotes and unquoted names.
        Assert.Equal([new RawBlock("x", "<p>hi</p>")], RawBlocks.Read("{blocks:[{id:'x',type:'raw',data:{html:'<p>hi</p>'}}]}"));
    }

    [Fact]
    public void Read_throws_on_data_it_cannot_read()
    {
        Assert.ThrowsAny<Exception>(() => RawBlocks.Read("{\"blocks\": [ {"));
    }

    [Fact]
    public void A_new_raw_block_is_reported()
    {
        var before = Doc(Paragraph("p1", "hi"));
        var after = Doc(Paragraph("p1", "hi"), Raw("r1", "<script>x</script>"));

        Assert.Equal([new RawBlock("r1", "<script>x</script>")], RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void Every_raw_block_of_a_new_item_is_reported()
    {
        Assert.Single(RawBlocks.FindNewOrChanged(null, Doc(Raw("r1", "<b>x</b>"))));
    }

    [Fact]
    public void A_raw_block_whose_html_changed_is_reported()
    {
        var before = Doc(Raw("r1", "<div>staff</div>"));
        var after = Doc(Raw("r1", "<div>staff</div><script>x</script>"));

        Assert.Single(RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void An_id_kept_with_another_raw_blocks_html_is_reported()
    {
        var before = Doc(Raw("r1", "one"), Raw("r2", "two"));
        var after = Doc(Raw("r1", "two"), Raw("r2", "two"));

        Assert.Equal([new RawBlock("r1", "two")], RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void A_paragraph_turned_into_a_raw_block_is_reported()
    {
        var before = Doc(Paragraph("p1", "<b>x</b>"));
        var after = Doc(Raw("p1", "<b>x</b>"));

        Assert.Single(RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void Unchanged_raw_blocks_are_not_reported_when_other_blocks_change()
    {
        var before = Doc(Paragraph("p1", "old"), Raw("r1", "<div>staff</div>"), Columns("c1", [Raw("r2", "<i>nested</i>")]));
        var after = Doc(Paragraph("p1", "new"), Paragraph("p2", "added"), Raw("r1", "<div>staff</div>"), Columns("c1", [Raw("r2", "<i>nested</i>")]));

        Assert.Empty(RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void A_removed_raw_block_is_not_reported()
    {
        var before = Doc(Paragraph("p1", "x"), Raw("r1", "<div>staff</div>"));
        var after = Doc(Paragraph("p1", "x"));

        Assert.Empty(RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void A_raw_block_saved_before_blocks_had_ids_is_matched_by_its_html()
    {
        // Editor.js gives a block an id when it loads one saved without.
        var before = """{"blocks":[{"type":"raw","data":{"html":"<div>legacy</div>"}}]}""";
        var after = Doc(Raw("new-id", "<div>legacy</div>"));

        Assert.Empty(RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void A_raw_block_moved_into_columns_with_the_same_html_is_not_reported()
    {
        var before = Doc(Raw("r1", "<div>staff</div>"));
        var after = Doc(Columns("c1", [Raw("r1", "<div>staff</div>")]));

        Assert.Empty(RawBlocks.FindNewOrChanged(before, after));
    }

    [Fact]
    public void Unreadable_stored_data_counts_as_having_no_raw_blocks()
    {
        Assert.Single(RawBlocks.FindNewOrChanged("{ not json", Doc(Raw("r1", "x"))));
    }
}
