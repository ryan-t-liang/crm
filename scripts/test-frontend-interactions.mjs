import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
const markup = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");

assert.match(source, /function initializeSidebar\(\)/, "sidebar initializer must exist");
assert.match(source, /\$\("sidebarToggle"\)\.addEventListener\("click"/, "sidebar toggle must handle clicks");
assert.match(source, /localStorage\.setItem\(SIDEBAR_STORAGE_KEY/, "sidebar state must persist");
assert.match(source, /classList\.add\("is-sidebar-transitioning"\)/, "sidebar text must enter a stable transition state");
assert.match(source, /event\.propertyName === "width"/, "sidebar transition must finish when width animation completes");
assert.match(source, /toggle\.disabled = true/, "sidebar toggle must prevent overlapping animations");
assert.match(source, /if \(collapsed\) closeAccountMenu\(\)/, "collapsing the sidebar must close an open account menu");
assert.match(source, /if \(!event\.target\.closest\("\.account-area"\)\) closeAccountMenu\(\)/, "outside clicks must close the account menu");
assert.match(source, /event\.key === "Escape"/, "Escape must close the account menu");
assert.match(markup, /body\.is-sidebar-collapsed \.nav-count \{ display: none; \}/, "collapsed sidebar must hide navigation counts");
assert.doesNotMatch(markup, /body\.is-sidebar-collapsed \.nav-item:hover::after/, "collapsed sidebar must not render detached hover flags");
assert.match(markup, /body\.is-sidebar-collapsed \.account-menu \{[\s\S]*?position: fixed;[\s\S]*?width: 210px;[\s\S]*?left: calc\(var\(--sidebar-collapsed\) \+ 12px\);/, "collapsed account menu must open as a fixed-width flyout");

for (const type of ["customers", "leads"]) {
  assert.match(source, new RegExp(`bindListSelection\\(\\"${type}\\"\\)`), `${type} list selection must be initialized`);
  assert.match(source, new RegExp(`updateListSelection\\(\\"${type}\\"\\)`), `${type} list selection must refresh after rendering`);
}

assert.match(source, /data-select-customer=/, "member rows must expose selectable customer IDs");
assert.match(source, /data-select-lead=/, "lead rows must expose selectable lead IDs");

console.log("frontend interaction contracts: PASS");
