# Personal CRM schema: what a Connection should hold

Researched 2026-11-11 for [#116](https://github.com/Fullchee/journal-native/issues/116): a text box on Connections that turns "Today I talked to Cindy about how she went to Taiwan last week" into a note on Cindy.

## Answer

Ranked by how much each change helps me stay close and remember more. Each one is backed by at least two apps or a friendship study.

1. **Log each conversation as its own row** (`connection_interactions`): a date, a kind (in person, call or message), a note and one or more people. Every app that logs contact stores one row per conversation, not lines appended to one text field: Monica, Dex, Folk, Fabriq, Covve and PeopleOS. #116 needs it most: the text box writes one row, which it can undo, and a group chat or a Mahjong night lands on every person at once (Dex and Monica 4 link one entry to many people). `lastContactedAt` becomes the newest row's date.
2. **Add Circles: shared communities, many-to-many** (`circles` plus `connection_circles`). Examples: "Mahjong", "Shockwave dragon boat", "University dragon boat" and "Coworkers". Monica (`contact_group`), Dex (groups and tags), Folk (`groups`) and Covve (tags) all let one person sit in many. Dunbar's "Seven Pillars of Friendship" include shared hobbies and education, so a shared community predicts a friendship.
3. **Split today's `circle` enum into two facts.** "Family" is a kind of tie, not a level of closeness. Dunbar's layers "include both extended family and conventional friends" (Dunbar 2025). Rename the tier to **closeness** (`close`, `friend` or none), and make Family a Circle.
4. **Move meetup schedules onto Circles.** Dragon boat practice is a fact about the team, not about each paddler. With the schedule on the Circle, adding someone to "Shockwave dragon boat" makes Today list them on practice days. Monica's groups and Mesh's per-group "Reconnect cadences" put shared settings on the group the same way.
5. **Link people to each other** (`connection_links`: two people and a label such as "partner"). Monica stores typed links with a reverse name (`relationship_types.name_reverse_relationship`). Dex stores "an undirected, untyped graph". PeopleOS stores partners in `love_relationships`. The text box needs this to resolve "Raj's partner" to Cindy.
6. **Add "met through" to how-we-met.** Keep `howWeMet` as one line, and add `metThroughId`, a link to the Connection who introduced us. Monica 4 had `first_met_through_contact_id`, `first_met_additional_info` and a first-met date. PeopleOS has `how_we_met`, `how_we_met_location`, `how_we_met_first_impressions` and a date. Dex has `first_met_at`. Skip a separate date and place: the one line already holds "dragon boat, 2024".
7. **Let a yearly date skip the year.** Monica (`day`, `month`, `year`, each nullable), PeopleOS (the same) and Dex (`birthday_year` nullable) all accept a birthday without a year. Today's `ConnectionDate.date` needs a full `YYYY-MM-DD`.

**Leave out**: life events, gifts, loans, pets, quality ratings, typed interaction reasons and tags beside Circles. Each appears in one or two apps, and a dated interaction note covers life events: "Cindy went to Taiwan" is that conversation's note. Keep `followUps` as text until the text box needs to tick one off.

## Circle or group, and what to call the tier

**Use "Circle" for shared communities. Rename today's tier to "closeness".**

- **Google+ used "circles" for communities.** Its launch post says people already share "with their circles", from "close family to foodies", and with "college buddies" ([Google, 2011](https://webarchive.library.unt.edu/web/20120110113335mp_/http://googleblog.blogspot.com/2011/06/introducing-google-project-real-life.html)). That is the owner's meaning.
- **Most personal CRMs say "group"**: Monica (`groups`), Dex, Folk, Mesh (formerly Clay). Google Contacts says "labels" ([Google Contacts Help](https://support.google.com/contacts/answer/30970)). Covve says "tags". None of them uses "circle" for a community.
- **Fabriq uses "circles" for closeness tiers**: Inner (about 5), Middle (about 10), Outer (about 35) and Extended (about 100) ([Fabriq Help](https://intercom.help/fabriq/en/articles/3027981-how-should-i-decide-who-goes-in-my-circles)). That is today's glossary meaning.
- **Dunbar's formal word is "layer".** The papers say "a series of layers" at 5, 15, 50 and 150 ([Sutcliffe et al. 2012](https://doi.org/10.1111/j.2044-8295.2011.02061.x); [Dunbar et al. 2015](https://doi.org/10.1016/j.socnet.2015.04.005)). They also say "friendship circles" and "inner circles" loosely ([Dunbar 2025](https://doi.org/10.1111/nyas.15309)).
- **Verdict**: the word is split across sources, so the owner's preference decides. "Circle" for communities matches Google+, and "group" is too generic a word for the glossary.
- **Call the tier "closeness"**, not "layer". Closeness is a plain word, and Dunbar's papers describe each layer by "emotional closeness". "Layer" is jargon, its sizes count cumulatively, and the glossary already calls the Health plan "the support layer".

## Today's model

`Connection` in `src/core/connections-view.ts`, stored in `connections` (migrations `0022`, `0024`, `0025`, `0029` and `0038`):

| Field             | Shape                                                                                       | Issue                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `circle`          | `close`, `friend`, `family` or `""`                                                         | Mixes closeness with a kind of tie                                               |
| `meetups`         | JSON `[{label, days, time}]` per person                                                     | The same team schedule is repeated on every teammate                             |
| `howWeMet`        | One line                                                                                    | Fine; no link to the person who introduced us                                    |
| `dates`           | `{label, date: YYYY-MM-DD, yearly}`                                                         | No birthday without a year                                                       |
| `followUps`       | Text                                                                                        | Fine for now                                                                     |
| `lastContactedAt` | Timestamp set by "Reached out"                                                              | Duplicates what an interaction log would hold                                    |
| `body`            | Markdown; "Reached out" appends a dated line (`APPEND_LINE` in `worker/api/connections.ts`) | Conversations and lasting facts share one field; an append can't be undone alone |

## Comparison across apps

"—" means the app has no such field, or its docs don't show one.

| App                                       | How we met                                                                   | Communities (many-to-many)                                                                                   | Closeness tier                             | Conversation log                                                                                            | Follow-ups                                              | Important dates                                          | Links between people                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| **Monica 5** (source)                     | — (dropped since 4)                                                          | `groups` via `contact_group`, typed (Family, Couple, Club, Association, Roommates) with roles; also `labels` | — (`is_favorite` only)                     | `calls` rows (date, reason, emotion, who started it, answered); `notes` rows with title and body            | `contact_tasks` (label, due, done); `contact_reminders` | `contact_important_dates` with nullable day, month, year | `relationships`, typed and directional, with a reverse name |
| **Monica 4** (source)                     | `first_met_additional_info`, first-met date, `first_met_through_contact_id`  | `tags` via `contact_tag`                                                                                     | —                                          | `activities` linked to many contacts via `activity_contact`; `conversations` with messages                  | Reminders                                               | `special_dates` with `is_year_unknown`                   | Typed relationships                                         |
| **PeopleOS** (source; by Monica's author) | `how_we_met`, location, first impressions, date                              | —                                                                                                            | —                                          | `encounters` rows (`seen_at`, `context`); `notes` rows                                                      | `tasks`                                                 | `special_dates` with nullable year                       | `love_relationships` (type, current)                        |
| **Dex** (API docs)                        | `first_met_at` (date)                                                        | Groups (nested) and tags; a contact can be in many                                                           | `priority_tier`; keep-in-touch `frequency` | Timeline notes: `event_time`, `meeting_type` (call, coffee, meal, meeting and more), many contacts per note | Reminders; keep-in-touch                                | `birthday` plus nullable `birthday_year`                 | Related contacts, undirected and untyped                    |
| **Folk** (API docs)                       | —                                                                            | `groups`: "zero, one or more" per person, each with its own custom fields                                    | —                                          | Interactions: `dateTime`, `title`, `content`, `activityType`; one person each                               | Reminders, moving to tasks                              | `birthday`                                               | —                                                           |
| **Mesh, formerly Clay** (help center)     | — (suggests a note label for "where you met them")                           | Groups, each with a reconnect cadence; hashtags in notes                                                     | Starred                                    | Notes on a Timeline tab                                                                                     | —                                                       | —                                                        | @mentions in a note link people both ways                   |
| **Fabriq** (help center)                  | —                                                                            | —                                                                                                            | Inner, Middle, Outer and Extended circles  | Tracked connections: quality, how you connected, who reached out, notes                                     | Reminders; touch-base timer                             | —                                                        | —                                                           |
| **Covve** (help center)                   | —                                                                            | Tags, "as many tags as you wish"                                                                             | —                                          | Records the date and time of each call, text or email; notes "against each call"                            | Follow-up reminders                                     | —                                                        | —                                                           |
| **Garden** (App Store)                    | —                                                                            | —                                                                                                            | —                                          | One notes field per contact                                                                                 | Per-contact frequency                                   | —                                                        | —                                                           |
| **UpHabit**                               | Not verified: its site returned 503 and its App Store page 404 on 2026-11-11 |                                                                                                              |                                            |                                                                                                             |                                                         |                                                          |                                                             |

Patterns:

- **Conversation log**: Monica, PeopleOS, Dex, Folk, Fabriq and Covve store each contact as its own dated row. Garden keeps one notes field. Mesh's docs don't say whether notes carry a date.
- **Communities**: Monica, Dex, Folk and Covve let one person sit in many groups or tags. Mesh's docs don't say either way. No app's docs limit a person to one.
- **How we met**: Monica 4, PeopleOS and Dex store it. Monica 4 also linked the introducer. Monica 5 dropped it.
- **Links between people**: four apps store them; Monica and PeopleOS type them.

## What the friendship research says

- **Layers and contact minima**: networks form layers at about 5, 15, 50 and 150 people. Staying in a layer needs contact "once a week for the 5‐layer, once a month for the 15‐layer, and once a year for the 150‐layer", "with these values being minima" ([Dunbar 2025](https://doi.org/10.1111/nyas.15309)). This supports a default cadence per closeness: weekly for close, monthly for friend.
- **Mode matters little for upkeep**: "Mode of contact seems to be unimportant" for keeping a tie ([Dunbar 2025](https://doi.org/10.1111/nyas.15309)). Still, "real (as opposed to casual) relationships require at least occasional face-to-face interaction" ([Dunbar 2016](https://doi.org/10.1098/rsos.150292)). So an interaction's kind should record "in person".
- **Friendships fade, family doesn't**: without enough contact, a friendship's closeness drops "within just a few months". Family ties are "relatively robust" ([Dunbar 2025](https://doi.org/10.1111/nyas.15309); [Roberts & Dunbar 2011](https://doi.org/10.1016/j.evolhumbehav.2010.08.005)). People with emotionally closer networks had shorter times since last contact ([Roberts & Dunbar 2011, _Personal Relationships_](https://doi.org/10.1111/j.1475-6811.2010.01310.x)). That is one more reason to keep family apart from closeness.
- **Hours make friends**: about 50 hours together turns an acquaintance into a casual friend, about 90 into a friend, and over 200 into a good friend. Time "hanging out, socializing, and playing games" counts; time working together counts much less ([KU News on Hall 2019](https://news.ku.edu/news/article/2018/03/06/study-reveals-number-hours-it-takes-make-friend); [Hall 2019](https://doi.org/10.1177/0265407518761225)). An in-person interaction row could carry optional minutes, so Grow closer can show hours together. Coworkers need time outside work.
- **Shared communities seed friendships**: the "Seven Pillars of Friendship" are language, place of origin, educational path, hobbies and interests, worldview, musical taste and sense of humour. "The more of these we share in common with someone, the stronger the" relationship ([Dunbar 2020](https://doi.org/10.1098/rspa.2020.0446)). Mahjong and dragon boat are hobbies; a university team is an educational path.
- **Group sizes are discrete**: humans form groups of about 3–5, 9–15 and 30–45 ([Zhou et al. 2005](https://doi.org/10.1098/rspb.2004.2970)), up to about 150 ([Hill & Dunbar 2003](https://doi.org/10.1007/s12110-003-1016-y)).

## Proposed schema

```sql
-- A shared community: a team, a game night, a workplace or my family.
CREATE TABLE circles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  meetups TEXT NOT NULL DEFAULT '[]' -- moved from connections: [{"label", "days", "time"}]
);

CREATE TABLE connection_circles (
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  circle_id INTEGER NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  PRIMARY KEY (connection_id, circle_id)
);

-- One conversation or meetup; it can include several people.
CREATE TABLE connection_interactions (
  id INTEGER PRIMARY KEY,
  occurred_on TEXT NOT NULL, -- YYYY-MM-DD
  kind TEXT NOT NULL CHECK (kind IN ('in_person', 'call', 'message')),
  minutes INTEGER CHECK (minutes IS NULL OR minutes > 0),
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE connection_interaction_people (
  interaction_id INTEGER NOT NULL REFERENCES connection_interactions (id) ON DELETE CASCADE,
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, connection_id)
);

-- Cindy is Raj's partner: one undirected row with a label.
CREATE TABLE connection_links (
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  other_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (connection_id, other_id),
  CHECK (connection_id < other_id)
);

-- connections: rename circle to closeness ('', 'close', 'friend'); add met_through_id.
-- Family rows join a "Family" circle and keep closeness for me to set.
```

What the #116 text box writes for "Today I talked to Cindy about how she went to Taiwan last week":

- **One interaction**: `occurred_on` today, `kind` from the wording (none given here, so ask or default to `in_person`), `note` "Went to Taiwan last week", person Cindy.
- **Follow-ups only when the sentence names one**, such as "ask how her new job goes".
- **`body` stays for lasting facts**, such as her kids' names. Conversations go to interactions. Old dated "Reached out" lines in `body` can be moved into interactions once.

## Sources

- Monica (main branch, `dab7427`, 2026-10-28), migrations in [`database/migrations`](https://github.com/monicahq/monica/tree/main/database/migrations): `create_group_table`, `create_relationship_types_table`, `create_calls_table`, `create_life_events_table`, `create_notes_table`, `create_contact_date_table`, `create_reminders_table`, `create_labels_table`, `create_contact_tasks_table`; default group and relationship types in [`SetupAccount.php`](https://github.com/monicahq/monica/blob/main/app/Domains/Settings/CreateAccount/Jobs/SetupAccount.php).
- Monica 4 ([`4.x` branch](https://github.com/monicahq/monica/tree/4.x/database/migrations)): `create_contacts_table` (`first_met_additional_info`), `add_met_through_to_contacts`, `create_ages_table` (`special_dates`), `create_activity_contact_table`, `create-conversations`, `create_tags_table`, `stay_in_touch`.
- PeopleOS ([`be0c1f1`](https://github.com/djaiss/peopleOS/tree/main/database/migrations)): `create_persons_table`, `create_encounters_table`, `create_notes_table`, `create_love_relationships_table`, `create_life_events_table`, `create_special_dates_table`.
- Dex: [Get a contact](https://getdex.com/docs/api-reference/reference/v2/contacts/get-a-contact), [Create a note](https://getdex.com/docs/api-reference/reference/v2/timeline/create-a-note), [List related contacts](https://getdex.com/docs/api-reference/reference/v2/contact-relations/list-related-contacts), [Groups vs Tags](https://getdex.com/docs/faq/groupsvstags), [Organize your contacts](https://getdex.com/docs/workflows/organize-your-contacts), [Keep in touch](https://getdex.com/docs/workflows/keep-in-touch), [New note creation](https://getdex.com/docs/workflows/new-note-creation).
- Folk: [Groups](https://developer.folk.app/core-concepts/groups.md), [People](https://developer.folk.app/core-concepts/people.md), [Create an interaction](https://developer.folk.app/api-reference/interactions/create-an-interaction.md).
- Mesh (formerly Clay): [Groups](https://library.me.sh/knowledge-base/groups/), [Organizing with groups and tags](https://library.me.sh/knowledge-base/organizing-clay-with-groups-and-tags/), [Notes](https://library.me.sh/knowledge-base/notes/).
- Fabriq Help: [Who goes in my circles](https://intercom.help/fabriq/en/articles/3027981-how-should-i-decide-who-goes-in-my-circles), [Limits per circle](https://intercom.help/fabriq/en/articles/3027986-why-are-there-limits-on-the-number-of-people-i-can-add-to-each-circle), [Connection details](https://intercom.help/fabriq/en/articles/4712250-can-i-track-connection-details-in-the-fabriq-imessage-app).
- Covve Help: [Tags](https://help.covve.com/help/what-are-tags), [Personal CRM and notes](https://help.covve.com/help/comms-your-personal-crm), [Reminders](https://help.covve.com/help/in-touch-stay-in-touch-with-your-most-important-contacts-and-keep-them-warm-for-when-you-need-them-most).
- Garden: [App Store listing](https://apps.apple.com/us/app/id1230466454).
- Google: [Introducing the Google+ project](https://webarchive.library.unt.edu/web/20120110113335mp_/http://googleblog.blogspot.com/2011/06/introducing-google-project-real-life.html) (2011, archived); [Google Contacts labels](https://support.google.com/contacts/answer/30970).
- R. Dunbar, "Why friendship and loneliness affect our health", _Annals of the New York Academy of Sciences_ 1545 (2025): 52–65, [doi:10.1111/nyas.15309](https://doi.org/10.1111/nyas.15309).
- R. Dunbar, "Structure and function in human and primate social networks", _Proceedings of the Royal Society A_ 476 (2020), [doi:10.1098/rspa.2020.0446](https://doi.org/10.1098/rspa.2020.0446).
- R. Dunbar, "The Anatomy of Friendship", _Trends in Cognitive Sciences_ 22 (2018), [doi:10.1016/j.tics.2017.10.004](https://doi.org/10.1016/j.tics.2017.10.004).
- R. Dunbar, "Do online social media cut through the constraints that limit the size of offline social networks?", _Royal Society Open Science_ 3 (2016), [doi:10.1098/rsos.150292](https://doi.org/10.1098/rsos.150292).
- R. Dunbar, V. Arnaboldi, M. Conti and A. Passarella, "The structure of online social networks mirrors those in the offline world", _Social Networks_ 43 (2015), [doi:10.1016/j.socnet.2015.04.005](https://doi.org/10.1016/j.socnet.2015.04.005).
- A. Sutcliffe, R. Dunbar, J. Binder and H. Arrow, "Relationships and the social brain", _British Journal of Psychology_ 103 (2012), [doi:10.1111/j.2044-8295.2011.02061.x](https://doi.org/10.1111/j.2044-8295.2011.02061.x).
- S. Roberts and R. Dunbar, "The costs of family and friends: an 18-month longitudinal study of relationship maintenance and decay", _Evolution and Human Behavior_ 32 (2011): 186–197, [doi:10.1016/j.evolhumbehav.2010.08.005](https://doi.org/10.1016/j.evolhumbehav.2010.08.005).
- S. Roberts and R. Dunbar, "Communication in social networks: Effects of kinship, network size, and emotional closeness", _Personal Relationships_ 18 (2011), [doi:10.1111/j.1475-6811.2010.01310.x](https://doi.org/10.1111/j.1475-6811.2010.01310.x).
- W.-X. Zhou, D. Sornette, R. Hill and R. Dunbar, "Discrete hierarchical organization of social group sizes", _Proceedings of the Royal Society B_ 272 (2005), [doi:10.1098/rspb.2004.2970](https://doi.org/10.1098/rspb.2004.2970).
- R. Hill and R. Dunbar, "Social network size in humans", _Human Nature_ 14 (2003), [doi:10.1007/s12110-003-1016-y](https://doi.org/10.1007/s12110-003-1016-y).
- J. Hall, "How many hours does it take to make a friend?", _Journal of Social and Personal Relationships_ 36 (2019), [doi:10.1177/0265407518761225](https://doi.org/10.1177/0265407518761225); hour figures from [KU News, 2018-03-06](https://news.ku.edu/news/article/2018/03/06/study-reveals-number-hours-it-takes-make-friend).
