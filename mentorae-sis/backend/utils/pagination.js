function parsePagination(query, defaults = {}) {
  const defaultLimit = defaults.limit || 25;
  const maxLimit = defaults.maxLimit || 100;

  let page = parseInt(query.page, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;

  let limit = parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginatedMeta(total, page, limit) {
  return { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) };
}

module.exports = { parsePagination, paginatedMeta };
