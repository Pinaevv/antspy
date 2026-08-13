// ═══════════════════════════════════════════════════════════════
// ЗАМЕНИ ЭТОТ URL на адрес твоего Cloudflare Worker
// Пример: https://antbot-proxy.ваш-аккаунт.workers.dev
// ═══════════════════════════════════════════════════════════════
const WORKER_URL = 'https://ЗАМЕНИ.МЕНЯ.workers.dev';

const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const API = {
    async request(path) {
        const res = await fetch(WORKER_URL + path, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || res.statusText);
        }
        return res.json();
    },

    async exportChat(chatId, fmt) {
        const res = await fetch(`${WORKER_URL}/api/chats/${chatId}/export?fmt=${fmt}`, {
            headers: {
                'X-Telegram-Init-Data': tg.initData
            }
        });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disp = res.headers.get('Content-Disposition') || '';
        const match = disp.match(/filename="(.+)"/);
        a.download = match ? match[1] : `export.${fmt}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

let currentChatId = null;
let chatsCache = [];

const els = {
    chats: document.getElementById('chats'),
    messages: document.getElementById('messages'),
    chatTitle: document.getElementById('chat-title'),
    menuBtn: document.getElementById('menu-btn'),
    dropdown: document.getElementById('dropdown'),
    backBtn: document.getElementById('back-btn'),
    chatList: document.getElementById('chat-list'),
    chatView: document.getElementById('chat-view'),
};

function avatarColor(name) {
    const colors = ['#E17076', '#FAA774', '#A695E7', '#7BC862', '#6EC9DC', '#E285C2', '#5A9FE7'];
    let hash = 0;
    for (const c of name) hash += c.charCodeAt(0);
    return colors[hash % colors.length];
}

function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortDate(dateStr) {
    if (!dateStr || !dateStr.includes(' ')) return '';
    return dateStr.split(' ')[1].slice(0, 5);
}

function renderChats(chats) {
    chatsCache = chats;
    els.chats.innerHTML = '';
    if (!chats.length) {
        els.chats.innerHTML = '<div class="placeholder">Нет сообщений</div>';
        return;
    }
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-item' + (chat.chat_id === currentChatId ? ' active' : '');
        item.dataset.id = chat.chat_id;
        item.innerHTML = `
            <div class="avatar" style="background:${avatarColor(chat.chat_title)}">${initials(chat.chat_title)}</div>
            <div class="chat-info">
                <div class="chat-row">
                    <span class="chat-name">${escapeHtml(chat.chat_title)}</span>
                    <span class="chat-date">${shortDate(chat.last_message_date)}</span>
                </div>
                <div class="chat-preview">${escapeHtml(chat.last_message_text || '(пусто)')}</div>
            </div>
        `;
        item.addEventListener('click', () => openChat(chat.chat_id));
        els.chats.appendChild(item);
    });
}

function mediaLabel(type) {
    const map = {
        photo: '🖼 Изображение',
        video_note: '📹 Кружок',
        video: '🎥 Видео',
        animation: '🎞 GIF',
        voice: '🎤 Голосовое',
        audio: '🎵 Аудио',
        sticker: '😀 Стикер',
        document: '📎 Файл'
    };
    return map[type] || (type ? `📎 ${type}` : '');
}

function renderMessages(messages, title) {
    els.chatTitle.textContent = title || 'ant-bot';
    els.messages.innerHTML = '';
    if (!messages.length) {
        els.messages.innerHTML = '<div class="placeholder">В чате пока нет сообщений</div>';
        return;
    }
    messages.forEach(msg => {
        const div = document.createElement('div');
        const isOut = msg.sender_id && msg.sender_id === tg.initDataUnsafe?.user?.id;
        div.className = `msg ${isOut ? 'msg-out' : 'msg-in'}`;
        const deleted = msg.deleted ? '<span class="msg-deleted">УДАЛЕНО</span>' : '';
        const media = msg.media_type ? `<div class="msg-media">${mediaLabel(msg.media_type)}</div>` : '';
        const text = msg.text ? `<div class="msg-text">${escapeHtml(msg.text)}</div>` : '';
        div.innerHTML = `
            <div class="msg-meta">${escapeHtml(msg.date)} — ${escapeHtml(msg.sender_name)}${deleted}</div>
            ${media}
            ${text}
        `;
        els.messages.appendChild(div);
    });
    els.messages.scrollTop = els.messages.scrollHeight;
}

async function openChat(chatId) {
    currentChatId = chatId;
    document.querySelectorAll('.chat-item').forEach(el => el.classList.toggle('active', +el.dataset.id === chatId));
    const chat = chatsCache.find(c => c.chat_id === chatId);
    try {
        const messages = await API.request(`/api/chats/${chatId}/messages`);
        renderMessages(messages, chat?.chat_title);
        if (window.innerWidth <= 768) {
            els.chatList.classList.add('hidden');
            els.chatView.classList.remove('hidden');
        }
    } catch (e) {
        els.messages.innerHTML = `<div class="placeholder">Ошибка: ${escapeHtml(e.message)}</div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

async function loadChats() {
    try {
        const chats = await API.request('/api/chats');
        renderChats(chats);
    } catch (e) {
        els.chats.innerHTML = `<div class="placeholder">Ошибка: ${escapeHtml(e.message)}</div>`;
    }
}

els.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.dropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => els.dropdown.classList.add('hidden'));

els.dropdown.addEventListener('click', (e) => {
    const fmt = e.target.dataset.fmt;
    if (!fmt || !currentChatId) return;
    API.exportChat(currentChatId, fmt).catch(err => {
        alert('Ошибка экспорта: ' + err.message);
    });
});

els.backBtn.addEventListener('click', () => {
    els.chatList.classList.remove('hidden');
    els.chatView.classList.add('hidden');
});

setInterval(() => {
    loadChats();
    if (currentChatId) openChat(currentChatId);
}, 3000);

loadChats();
