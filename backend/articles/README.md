# Adding articles

To publish an article, add a `.md` (Markdown) file to this folder. That's it — no
command to run, nothing else to touch. The site picks it up automatically.

To remove an article, delete its `.md` file from this folder.

## Title

The article's title is taken from the first line of the file if it's a top-level
heading:

```
# My Article Title
```

If there's no heading, the title is generated from the filename instead (dashes and
underscores become spaces, and it's capitalized) — so `trade-deadline-preview.md`
becomes "Trade Deadline Preview". Using a `#` heading gives you more control over how
the title looks (capitalization, punctuation, etc.), so it's the better option.

## Formatting

Regular Markdown works: `## headings`, **bold**, _italics_, lists, links, and so on.

## Likes and views

Likes and views are tracked separately from the file itself, in
`backend/db/article-counters.json`, keyed by filename. You don't need to touch that
file — it's created and updated automatically. If you rename a `.md` file, it'll be
treated as a brand new article (starting at 0 likes/views) rather than carrying over
its old count, since the filename is how an article is identified.
