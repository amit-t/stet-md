# Sample PRD

A small fixture used by the round-trip / byte-preservation tests.

## Product goals

Support block-level review comments that live inside the Markdown file.

Keep diffs minimal: saving a comment must splice bytes, not reformat the file.

## Non-goals

No real-time collaboration. No hosted service. No WYSIWYG editor.

## Notes

A paragraph with `inline code` and a [reference link][ref], plus trailing space.   

A documentation example must be ignored by the parser:

```markdown
<!-- redline:thread
id: rlt_example
-->
> example only
<!-- /redline:thread -->
```

[ref]: https://example.com/spec
