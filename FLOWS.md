# Blog publishing checks

- Open `/blog`: “Guides & comparisons” and the original posts appear. Select “Comparisons,” then “All”; cards update.
- Open “SillyTavern vs RisuAI” from the listing and by direct URL; its title, sections, and Blog back link work.
- Open global search and type “SillyTavern vs RisuAI”; the Blog result opens the same article. Other search groups still work.
- Open an unknown article URL; it shows “Article not found.” A failed database request shows an availability error instead.
- A signed test webhook succeeds without writing. Bad signatures fail. Repeated deliveries do not overwrite existing articles. New drafts are not readable by public clients.
