// Functions that run inside the Teams page (via page.evaluate). They can't use anything from Node.

// Returns { ok, reason } — ok only if the open chat is provably your self-chat.
function selfChatCheck(selfChatId) {
  const fail = (reason) => ({ ok: false, reason });
  const listItem = [...document.querySelectorAll('[role="treeitem"][data-item-type="chat"]')].find((e) =>
    (e.getAttribute('data-fui-tree-item-value') || '').endsWith('|' + selfChatId)
  );
  if (!listItem) return fail('self-chat not found in chat list');
  // Your user id is embedded in the self-chat's list entry: "...~<tenant>~<userId>~...".
  const m = listItem.getAttribute('data-fui-tree-item-value').match(/~([0-9a-f-]{36})~/i);
  if (!m) return fail('could not read your user id');
  const myMri = '8:orgid:' + m[1];

  if (!/\(You\)/.test(document.title)) return fail('window title is not the (You) chat: ' + document.title);
  const header = document.querySelector('[data-tid="chat-title"]');
  if (!header) return fail('no chat header');
  const people = [...header.querySelectorAll('[data-person-mri]')];
  if (people.length !== 1) return fail('chat header has ' + people.length + ' participants');
  if (people[0].getAttribute('data-person-mri') !== myMri) return fail('header participant is not you');
  const name = people[0].textContent.trim();
  if (!name.endsWith('(You)')) return fail('header name does not end with (You)');

  const myName = name.replace(/\s*\(You\)$/, '');
  const authors = [...document.querySelectorAll('[data-tid="message-author-name"]')].map((e) => e.textContent.trim());
  const stranger = authors.find((a) => a !== myName);
  if (stranger) return fail('message from someone else visible: ' + stranger);
  return { ok: true, myName };
}

function readMessages() {
  return [...document.querySelectorAll('[data-tid="chat-pane-message"][data-mid]')].map((e) => {
    const content = e.querySelector('[data-message-content]');
    // innerText keeps the line breaks between <p> paragraphs.
    return { mid: Number(e.getAttribute('data-mid')), text: content ? content.innerText.trim() : '' };
  });
}

module.exports = { selfChatCheck, readMessages };
