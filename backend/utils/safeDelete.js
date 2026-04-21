// backend/utils/safeDelete.js
// Transactional cascading delete helper for FK-safe deletions.
// Usage:
//   const { safeDelete } = require('../utils/safeDelete');
//   await safeDelete(db, {
//     parent:   { table: 'students', column: 'student_id', id: req.params.id },
//     children: [
//       { table: 'fee_payments', via: { joinTable: 'fees', joinColumn: 'student_id', fkColumn: 'fee_id' } },
//       { table: 'attendance',                 column: 'student_id' },
//       { table: 'fees',                       column: 'student_id' },
//       { table: 'marks',                      column: 'student_id' },
//       { table: 'student_subject_enrollment', column: 'student_id' },
//       { table: 'student_disciplines',        column: 'student_id' },
//     ],
//     preChecks: async (conn) => { /* optional existence check, throw if 404 */ },
//   });

async function safeDelete(dbPool, config) {
  const { parent, children = [], preChecks } = config;
  if (!parent || !parent.table || !parent.column || parent.id == null) {
    throw new Error('safeDelete: parent { table, column, id } is required');
  }

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    // Optional pre-check (e.g., confirm row exists, return 404)
    if (typeof preChecks === 'function') {
      await preChecks(conn);
    }

    // Delete grandchildren via join (e.g. fee_payments via fees)
    // then direct children, in the order provided (children-first is caller's responsibility)
    for (const child of children) {
      if (child.via) {
        // e.g. DELETE FROM fee_payments WHERE fee_id IN (SELECT fee_id FROM fees WHERE student_id=?)
        const { joinTable, joinColumn, fkColumn } = child.via;
        await conn.query(
          `DELETE FROM ?? WHERE ?? IN (SELECT ?? FROM ?? WHERE ?? = ?)`,
          [child.table, fkColumn, fkColumn, joinTable, joinColumn, parent.id]
        );
      } else {
        await conn.query(
          `DELETE FROM ?? WHERE ?? = ?`,
          [child.table, child.column, parent.id]
        );
      }
    }

    // Finally, delete parent
    const [result] = await conn.query(
      `DELETE FROM ?? WHERE ?? = ?`,
      [parent.table, parent.column, parent.id]
    );

    await conn.commit();
    return { affectedRows: result.affectedRows };
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }
}

// Maps MySQL FK errors to human-readable messages
function mapDeleteError(err, entityLabel = 'record') {
  if (!err) return { status: 500, body: { error: 'Internal server error' } };

  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
    return {
      status: 409,
      body: {
        error: `Cannot delete this ${entityLabel} — other records depend on it.`,
        hint: 'Remove or reassign the dependent records first, or contact an admin to update the cascade rules.',
        debug: err.sqlMessage,
      },
    };
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
    return { status: 400, body: { error: 'Referenced record does not exist.', debug: err.sqlMessage } };
  }
  return { status: 500, body: { error: 'Internal server error' } };
}

module.exports = { safeDelete, mapDeleteError };
