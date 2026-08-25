module.exports = function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'غير مصرح. الرجاء تسجيل الدخول إلى لوحة التحكم.' });
};
