# URL parity with `journal`

Every page URL of the SvelteKit `journal` app (`src/routes`, plus `static/`) opens the same screen here, on web and through `dev.fullchee.journal://` deep links. No path changed, so there are no redirects. `src/__tests__/journal-url-parity-test.tsx` checks each row, both as a web path and as a `dev.fullchee.journal://` deep link.

| `journal` URL        | Expo Router file (`src/app`)           | Notes                                                                                       |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/`                  | `(tabs)/index.tsx`                     | `?zone=<Zone>` preselects the Check-in zone; `?log` opens `/log`.                           |
| `/check-ins`         | `(tabs)/check-ins.tsx`                 |                                                                                             |
| `/habits`            | `(tabs)/habits.tsx`                    | Filter params (`kind`, `stage`, `startFrom`…) carry over; `?edit=<id>` opens `/habit/<id>`. |
| `/library`           | `(tabs)/(notes)/library/index.tsx`     |                                                                                             |
| `/library/<id>`      | `(tabs)/(notes)/library/[id].tsx`      |                                                                                             |
| `/notes?type=<type>` | `(tabs)/(notes)/notes/index.tsx`       | One list holds every type; `?type` puts that type's section first.                          |
| `/notes/<type>/<id>` | `(tabs)/(notes)/notes/[type]/[id].tsx` |                                                                                             |
| `/connections`       | `(tabs)/connections/index.tsx`         |                                                                                             |
| `/connections/<id>`  | `(tabs)/connections/[id].tsx`          |                                                                                             |
| `/plan`              | `plan.tsx`                             |                                                                                             |
| `/session-brief`     | `session-brief.tsx`                    |                                                                                             |
| `/health-plan`       | `(tabs)/(notes)/health-plan.tsx`       |                                                                                             |
| `/privacy`, `/terms` | `public/{privacy,terms}.html`          | Web only: the static legal pages.                                                           |

When a route moves, add a redirect that keeps ids and query strings, and add its row here and in the test.
