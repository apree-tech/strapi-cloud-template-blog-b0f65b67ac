import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex, Typography, Button, Textarea, Field } from '@strapi/design-system';
import { useFetchClient } from '@strapi/admin/strapi-admin';
import { useDomSync } from '../hooks/useDomSync';

const ChatCommentsEditor = ({ name, value, onChange, disabled }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const textareaRef = useRef(null);
  const { get } = useFetchClient();

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const { data } = await get('/admin/users/me');
        setCurrentUser(data?.data || data);
      } catch (e) {
        console.error('[ChatComments] Failed to fetch current user:', e);
      }
    };
    fetchCurrentUser();
  }, [get]);

  // Fetch admin users for mentions
  useEffect(() => {
    const fetchAdminUsers = async () => {
      try {
        const { data } = await get('/admin/users?pageSize=100');
        const users = data?.data?.results || data?.results || [];
        setAdminUsers(users);
      } catch (e) {
        console.error('[ChatComments] Failed to fetch admin users:', e);
      }
    };
    fetchAdminUsers();
  }, [get]);

  // Parse value on mount
  useEffect(() => {
    if (value) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } catch (e) {
        setMessages([]);
      }
    }
  }, []);

  // DOM sync for real-time collaboration
  const handleRemoteUpdate = useCallback((newMessages) => {
    setMessages(newMessages);
    onChange({
      target: {
        name,
        value: newMessages,
        type: 'json',
      },
    });
  }, [name, onChange]);

  const { updateValue: broadcastUpdate } = useDomSync(
    `chat-comments:${name}`,
    messages,
    handleRemoteUpdate
  );

  // Update parent form and broadcast
  const updateValue = (newMessages) => {
    setMessages(newMessages);
    // Broadcast to other users
    broadcastUpdate(newMessages);
    onChange({
      target: {
        name,
        value: newMessages,
        type: 'json',
      },
    });
  };

  // Handle text input with @ detection
  const handleInputChange = (e) => {
    const text = e.target.value;
    setNewMessage(text);

    // Detect @ for mentions
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ' || textBeforeCursor[atIndex - 1] === '\n')) {
      const searchTerm = textBeforeCursor.slice(atIndex + 1);
      // Allow spaces in search (for "firstname lastname"), but stop at newline or double space
      if (!searchTerm.includes('\n') && !searchTerm.includes('  ') && searchTerm.length < 50) {
        setMentionSearch(searchTerm.toLowerCase());
        setMentionPosition(atIndex);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  // Filter users for autocomplete
  const filteredUsers = adminUsers.filter(user => {
    const fullName = `${user.firstname || ''} ${user.lastname || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    return fullName.includes(mentionSearch) || email.includes(mentionSearch);
  }).slice(0, 5);

  // Insert mention
  const insertMention = (user) => {
    const firstName = (user.firstname || '').trim();
    // Only use firstname for mention (lastname like "User" is just a placeholder)
    const userName = firstName || user.email;

    const beforeMention = newMessage.slice(0, mentionPosition);
    const cursorPos = textareaRef.current?.selectionStart || (mentionPosition + mentionSearch.length + 1);
    const afterMention = newMessage.slice(cursorPos);
    const newText = `${beforeMention}@${userName} ${afterMention.trimStart()}`;

    setNewMessage(newText);
    setShowMentions(false);
    setMentionSearch('');
    textareaRef.current?.focus();
  };

  // Extract mentions from text
  const extractMentions = (text) => {
    const mentions = [];
    const mentionRegex = /@([а-яА-ЯёЁa-zA-Z0-9_\s]+?)(?=\s|$|[.,!?;:]|@)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionName = match[1].trim();
      const user = adminUsers.find(u => {
        const fullName = `${u.firstname || ''} ${u.lastname || ''}`.trim();
        return fullName.toLowerCase() === mentionName.toLowerCase();
      });
      if (user) {
        mentions.push({
          id: user.id,
          name: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
          email: user.email,
          type: 'admin',
        });
      }
    }
    return mentions;
  };

  // Send message
  const sendMessage = () => {
    if (!newMessage.trim() || !currentUser) return;

    const authorName = `${currentUser.firstname || ''} ${currentUser.lastname || ''}`.trim() || currentUser.email;
    const mentions = extractMentions(newMessage);

    const message = {
      id: Date.now(),
      content: newMessage.trim(),
      author_id: currentUser.id,
      author_name: authorName,
      author_type: 'admin',
      mentions,
      created_at: new Date().toISOString(),
    };

    updateValue([...messages, message]);
    setNewMessage('');
  };

  // Handle Enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render content with highlighted mentions
  const renderContent = (content) => {
    const parts = content.split(/(@[а-яА-ЯёЁa-zA-Z0-9_\s]+?)(?=\s|$|[.,!?;:]|@)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} style={{ color: '#7c3aed', fontWeight: 500 }}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Delete message
  const deleteMessage = (msgId) => {
    updateValue(messages.filter(m => m.id !== msgId));
  };

  return (
    <Box>
      {/* Messages list */}
      <Box
        padding={3}
        background="neutral100"
        borderRadius="4px"
        style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '12px' }}
      >
        {messages.length === 0 ? (
          <Typography variant="pi" textColor="neutral500">
            Нет комментариев. Введите сообщение ниже.
          </Typography>
        ) : (
          messages.map((msg) => (
            <Box
              key={msg.id}
              padding={2}
              marginBottom={2}
              background="neutral0"
              borderRadius="4px"
              style={{ borderLeft: '3px solid #7c3aed' }}
            >
              <Flex justifyContent="space-between" alignItems="flex-start">
                <Box style={{ flex: 1 }}>
                  <Flex gap={2} alignItems="center" marginBottom={1}>
                    <Typography variant="sigma" fontWeight="bold" textColor="neutral800">
                      {msg.author_name}
                    </Typography>
                    <Typography variant="pi" textColor="neutral500">
                      {formatDate(msg.created_at)}
                    </Typography>
                  </Flex>
                  <Typography variant="omega" textColor="neutral700" style={{ whiteSpace: 'pre-wrap' }}>
                    {renderContent(msg.content)}
                  </Typography>
                </Box>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="S"
                    onClick={() => deleteMessage(msg.id)}
                    style={{ minWidth: 'auto', padding: '4px' }}
                  >
                    ✕
                  </Button>
                )}
              </Flex>
            </Box>
          ))
        )}
      </Box>

      {/* New message input */}
      {!disabled && (
        <Box style={{ position: 'relative' }}>
          <Field.Root>
            <Flex gap={2}>
              <Box style={{ flex: 1, position: 'relative' }}>
                <Textarea
                  ref={textareaRef}
                  placeholder="Введите комментарий... Используйте @ для упоминания"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  style={{ minHeight: '60px' }}
                />

                {/* Mentions dropdown */}
                {showMentions && filteredUsers.length > 0 && (
                  <Box
                    padding={2}
                    background="neutral0"
                    shadow="tableShadow"
                    borderRadius="4px"
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      marginBottom: '4px',
                      zIndex: 100,
                      border: '1px solid #dcdce4',
                    }}
                  >
                    {filteredUsers.map((user) => (
                      <Box
                        key={user.id}
                        padding={2}
                        style={{ cursor: 'pointer', borderRadius: '4px' }}
                        onClick={() => insertMention(user)}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0ff'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Typography variant="omega">
                          <span style={{ color: '#7c3aed', fontWeight: 600 }}>@{user.firstname || user.email}</span>
                          <span style={{ color: '#666', marginLeft: '8px' }}>{user.lastname} {user.email}</span>
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
              <Button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
              >
                ➤ Отправить
              </Button>
            </Flex>
          </Field.Root>
        </Box>
      )}
    </Box>
  );
};

export default ChatCommentsEditor;
