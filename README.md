# Universal Power Flow Card

**Visual topology designer and animated electrical-power dashboard for Home Assistant.**

![Conceptual AC/DC telecom topology](docs/universal-topology-preview.svg)

*Illustrative architecture preview; this is not a screenshot or a physical wiring diagram.*

Developed in [maksbit/universal-power-flow-card](https://github.com/maksbit/universal-power-flow-card), independently from the original Sunsynk Power Flow Card. The new Lovelace element is `custom:universal-power-flow-card`, and the JavaScript resource is `universal-power-flow-card.js`. Both cards can coexist on one Home Assistant dashboard.

## Getting started

A preview release will be published when the CI and Home Assistant checks pass. Add this repository as a HACS custom frontend repository, install the **Universal Power Flow Card** release and add it to a dashboard, selecting the visual editor.

To test an unreleased build, use the JS artifact produced by the **CI - typecheck, unit tests and build** workflow, save it to `/config/www/universal-power-flow-card/universal-power-flow-card.js`, add **JavaScript module** dashboard resource `/local/universal-power-flow-card/universal-power-flow-card.js`, then add:

```yaml
type: custom:universal-power-flow-card
title: Telecom power infrastructure
```

The card initially shows the **example topology** with no animated values; telemetry is not fabricated. Open the visual editor to bind each edge to its power sensor.

## v0.2.5 — in-page maximized workspace and HA-safe interaction

- **Full-screen editor** now uses the browser's **HTML Popover API** to occupy the entire **webpage viewport**, above Home Assistant's configuration dialog. It does **not** call `requestFullscreen()` and does not change the browser's own fullscreen state, toolbar or desktop layout.
- The canvas and inspector occupy separate resizable viewport columns; only the inspector scrolls.
- During device dragging, **pointer capture is held by the stable SVG canvas**, rather than a potentially replaced equipment node.
- Frequent Home Assistant sensor updates no longer trigger Lit rendering while a pointer drag is active, avoiding DOM replacements beneath the mouse.
- A stale HA `setConfig` echo cannot replace device positions during dragging or discard unsaved edits, in either compact or expanded mode.
- Chromium checks require in-tab Popover mode, confirm `document.fullscreenElement === null`, maintain live connections, stress telemetry and stale config updates while moving, then test repeat drag, inspector edits, deletion and reopening.

**Known limitation:** The Playwright harness simulates Home Assistant's card settings dialog; it cannot fully substitute for hands-on acceptance against the user's actual HA frontend. Retain a JSON export of your diagram before testing new releases.

## v0.2.4 — connected drag and real fullscreen

- Equipment and power-flow connections now move **together during the drag gesture**. The in-memory node position and obstacle-aware SVG path geometry update together while preserving the existing SVG DOM; nothing is disconnected from its port.
- On pointerup the new coordinates are committed to the Lovelace configuration once, and they survive clicking a blank area, selecting other equipment, and Home Assistant's `config-changed` echo.
- Interrupted gestures roll back to the previous valid position. Signed-power flow animation paths update with changed routing.
- Full-screen editor now calls the native browser Fullscreen API, placing the workspace in the top layer beyond Home Assistant's clipped card configuration modal. Toolbar, work canvas and scrollable inspector fill the viewport. Browser permission failures display an explicit message rather than opening a clipped pseudo-fullscreen.
- Browser acceptance tests assert: true viewport bounds, connected wire changes **before mouse release**, persistence after background click, twice dragging the same node, cross-node dragging, property edits, deletion, sensor selection and full-screen reopening.

**Usage:** Open the card editor, then choose **Full-screen editor**. Allow fullscreen if your browser requests permission. Esc or **Close full screen** exits; unsaved Lovelace changes still require **Save** in Home Assistant.

## v0.2.3 — stable repeated dragging inside Home Assistant

- Reworked pointer handling: dragging a device now moves the SVG element visually without mutating the reactive diagram on every mouse movement. Device position, connection routing and HA configuration update **once** on pointer release.
- Resets the drag preview when interrupted by blur/visibility changes/cancel, and recovers on a subsequent click if the host dialog swallowed `pointerup`.
- Decorative SVG artwork no longer intercepts device clicks; equipment boxes receive events consistently.
- Extended Chromium regression flow: move same device twice, edit a property, simulate a lost pointerup, move another device, delete a device, select a sensor and reopen fullscreen.
- Existing card schema and saved entity bindings stay unchanged. Existing Sunsynk card remains unaffected.

## v0.2.2 — interactive editor reliability

Home Assistant's own configuration editor already operates within a dialog. This release avoids opening a second native modal, which could swallow focus and pointer events. The large workspace is now a fixed in-component overlay.

- A **single click** selects a device immediately; no dragging needed. Mouse movement under 6 px is treated as a click.
- Dragging records the pointer ID and releases all handlers on pointerup, cancel, blur and visibility loss. No stuck drag after selecting or moving one device.
- Lit now explicitly schedules UI updates for selection, fullscreen, zoom, pan, port selection, deletion warnings and entity suggestions. Some build configurations did not reliably observe decorated state field mutations.
- Deleting a connected device uses **two-stage inline confirmation** rather than a nested browser prompt.
- Repeated Home Assistant configuration echoes do not overwrite edits while the fullscreen workspace is active.
- Real Chromium end-to-end tests are run on the self-hosted CI inside the official Playwright Docker image. They cover fullscreen opening, single-click selection, editing, adding, dragging, deletion, entity search/selection, config echoes and modal reopening.

**Safety:** Export your current diagram to JSON before testing a new release. The current Home Assistant dashboard remains unchanged until you save your edits.

## v0.2.1 — Home Assistant sensor picker and flow diagnostics

- Entity selection uses a dedicated, continuously visible autocomplete component with a search input and suggestions from the first keystroke, not the former delayed two-character list. Choose a sensor by friendly name or entity ID, inspect its live state and unit, or enable **Показать все сенсоры** to find custom integration entities including `input_number.*`.
- Each device/connection inspector now includes **Проверка анимации** status that explains missing sensor, invalid/non-numeric or wrong-unit state, disabled animation, blocked route, zero power, and sign/direction.
- A battery power entity drives its single power link automatically. For equipment with multiple power links, explicitly select the target link to avoid applying the same aggregate reading to every branch.
- Active power connections show a directional indicator plus an SMIL animated dot. Negative power reverses the actual SVG motion path rather than relying on browser-specific keyPoints/keyTimes behavior.
- The editor now ignores identical configuration echoes from Home Assistant to avoid resetting the entity picker and open fullscreen dialog.

**Acceptance in HA:** install v0.2.1, select Battery, search the **Мощность** sensor and observe its current numeric state, then verify the diagnostic status on the battery's logical DC link; compare charge/discharge directions. Values from SOC or boolean discharge status alone cannot determine power flow direction.

## v0.2.0 — logical power flow and native SVG equipment

- DC and PV circuits are **one logical power-flow connection each**, not individual DC+ and DC− conductors. This is a live dashboard, not a wiring design. AC, DC, PV and generator-start/control stay distinct.
- Existing v0.1.x saved diagrams are upgraded in memory from DC+/DC− pairs to logical DC links. Device positions, explicit waypoints and HA power-entity bindings are retained. A conflicting sensor pair is left unchanged with a warning to prevent silent data loss. The converted diagram is persisted on the next user edit; export JSON first if you want a snapshot.
- Built-in inline SVG artwork: battery rack/cell, hybrid and wall inverters, rectifier shelf/converter, DC busbar, AC distribution, PV, generator, grid, telecom server. Select a model in the node inspector. The model library is bundled in JS and works offline.
- Full-screen editor dialog stays mounted while Lit and HA re-render; opens directly on clicking the button rather than being recreated reactively.
- Home Assistant entities are selected with **typed, searchable suggestions** filtered by domain, device class, units and friendly name. Separate power, SOC, voltage, current and status inputs are provided. Direct entity_id input remains supported.
- **Direction comes only from a numeric power sensor (W/kW/MW).** Assign it to a connection (highest priority), or to an equipment node with exactly one power connection (e.g., battery rack) to animate that link. Use **positive means outgoing/incoming** for charge/discharge sensor sign conventions. A node with several power links (e.g., inverter or bus) never automatically projects one aggregate meter onto all branches; bind those edges separately.
- The power sensor's signed value sets animation direction. SOC/voltage/current are telemetry on the device, and do not infer flow direction. Zero/unknown/unavailable readings do not animate.

## Visual editor

**v0.1.3:** Obstacle-aware Manhattan pathfinding avoids component boxes with clearance, replans lines when devices move, and discourages overlapping wiring corridors. The editor now sends immutable configuration snapshots and triggers a dedicated reactive refresh on each edit, so deletions and parameter changes should immediately affect the canvas and Lovelace preview. If an automatic route is impossible, the editor reports it rather than silently drawing a line through equipment. Manual bend points and straight mode remain explicit user overrides and may cross equipment; inspect those links visually.


**v0.1.2 layout usability:** click **Full-screen editor** to work on a large responsive canvas, not in Home Assistant's narrow card setup column. Drag device bodies to move (window-level pointer tracking); select components/wires from the **Selected** list and click **Delete selected**, or select on the canvas and press Delete. Wires use automatically separated orthogonal lanes rather than a shared center; select a wire to configure routing axis, lane offset, color, width, speed and optional signed power sensor. Double-click a wire to add manual bend handles, or use **Edit bends**; drag handles and **Reset auto bends** to revert.



- Drag equipment from the palette onto the canvas or use **+ Add**.
- Move devices by dragging them; Shift+drag an empty background to pan; Ctrl+wheel or +/- buttons to zoom.
- Click the **source port**, then the **target port** to connect. AC, logical DC, logical PV and control/signal cannot be mixed.
- Select a connection to bind a Home Assistant power entity (W/kW/MW), invert its sign, add or drag bend points, or use automatic orthogonal routing.
- Select equipment to edit its name, icon (`mdi:...`), size, scale, rotation, optional status/SOC entity, and electrical ports.
- Use **Save as component** to store customized equipment templates in this card's configuration.
- Export/import JSON to reuse layouts, including their custom library. Import validates topology.
- Configuration changes are persisted by Home Assistant's standard Lovelace `config-changed` editor event; edit via dashboard configuration mode. Export is recommended for backup.

## Electrical semantics

| Wire | Port kind | Appearance |
|---|---|---|
| AC | `ac` | amber |
| 48V DC power circuit | `dc` | red |
| Photovoltaic power circuit | `pv` | gold |
| Legacy polarity pairs (migration only) | `dc+`/`dc-`, `pv+`/`pv-` | converted to logical links |
| Generator start / signalling | `signal` | blue dashed |

A positive power-sensor reading animates **from source to target**, a negative reading reverses direction. Use **Invert flow direction** when a meter has the opposite sign convention. Zero/unknown/unavailable readings do not animate; **unknown is never silently interpreted as zero**. Circuit power must be measured independently: sums of common-bus, inverter and rectifier powers can double count recirculated energy.

Port compatibility checks are **diagramming safeguards**, not full electrical-design verification; they do not enforce voltage ratings, phases, earthing or protection coordination. The visual card does not control electrical equipment.

## Example: dual-Deye telecom site

The starter diagram illustrates external GRID → Deye #1 GRID; generator AC → Deye #1 GEN with a separate start signal; Deye #1 LOAD → AC distribution, AC loads and AC/DC rectifier; rectifier DC+/− → shared 48V bus; battery DC power and both Deye BAT DC ports → **the same bus**; Deye #2 LOAD → separate off-grid AC load; telecom DC servers connected to the common DC bus through one logical DC link each. The DC bus is **not an AC load**. Values stay unavailable until sensors are configured.

## Technology

TypeScript, Lit 3, SVG with SMIL animateMotion, Rollup, browser-native pointer events, structured JSON schema (version 1), Home Assistant Lovelace config-changed event. No backend service is required.

```sh
npm install --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

## Licensing / upstream attribution

This repository derives from [slipx06/sunsynk-power-flow-card](https://github.com/slipx06/sunsynk-power-flow-card), originally authored by slipx06. The original MIT LICENSE and copyright notice are preserved. Independent universal-editor functionality is developed in this repository.
