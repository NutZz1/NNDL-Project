const ChatAgent = require('../services/chatAgent');

// POST /api/chat  { messages: [{ role, content }] }   (staff login required)
// The API key never leaves the server, and every answer is limited to what the logged-in
// user is allowed to see (see services/chatAgent.js).
exports.chatWithAnalytics = async (req, res) => {
  try {
    const messages = req.body && req.body.messages;
    const last = Array.isArray(messages) && messages.length ? String(messages[messages.length - 1].content || '') : '';
    // Audit trail: who asked what (question truncated, no tool output)
    console.log(`[Chat] ${req.user.name} (${req.user.role}${req.scope.team ? `/${req.scope.team}` : ''}): ${last.slice(0, 160).replace(/\s+/g, ' ')}`);

    const result = await ChatAgent.ask({ user: req.user, scope: req.scope, messages });
    console.log(`[Chat] -> ${result.toolCalls.map((t) => t.name).join(', ') || 'no tools'}`);
    res.json({ reply: result.reply, model: result.model, toolCalls: result.toolCalls.map((t) => t.name), codes: result.codes });
  } catch (err) {
    const status = err.status && err.status < 500 && err.status !== 401 ? err.status : 502;
    if (status === 502) console.error('[Chat] error:', err.message);
    res.status(status).json({
      error: status === 502 ? 'The assistant is unavailable right now. Please try again in a moment.' : err.message,
    });
  }
};
