/**
 * Security Audit Log Service
 * Concise, targeted logging for security events
 */

export class AuditLogService {
  constructor(cloudantClient, dbName = 'maia_audit_log') {
    this.cloudant = cloudantClient;
    this.dbName = dbName;
  }

  /**
   * Log a security event
   * @param {Object} event - Event details
   * @param {string} event.type - Event type: 'login_success', 'login_failure', 'logout', 'passkey_registered', 'session_expired'
   * @param {string} event.userId - User ID (optional for failures)
   * @param {string} event.ip - IP address
   * @param {string} event.userAgent - User agent string
   * @param {string} event.details - Additional details (optional)
   */
  async logEvent(event) {
    try {
      const timestamp = new Date().toISOString();
      const docId = `${event.type}_${timestamp.replace(/[:.]/g, '-')}_${Math.random().toString(36).substr(2, 6)}`;

      const auditDoc = {
        _id: docId,
        type: event.type,
        userId: event.userId || null,
        timestamp,
        ip: event.ip || null,
        userAgent: event.userAgent || null,
        details: event.details || null
      };

      await this.cloudant.saveDocument(this.dbName, auditDoc);
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Don't throw - audit logging should not break the app
    }
  }

  /**
   * Get audit logs for a user
   */
  async getUserLogs(userId, limit = 50) {
    try {
      const query = {
        selector: {
          userId: userId
        },
        sort: [{ timestamp: 'desc' }],
        limit
      };

      const result = await this.cloudant.findDocuments(this.dbName, query);
      return result.docs;
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  }

  /**
   * Get audit logs by event type
   */
  async getLogsByType(type, limit = 50) {
    try {
      const query = {
        selector: {
          type: type
        },
        sort: [{ timestamp: 'desc' }],
        limit
      };

      const result = await this.cloudant.findDocuments(this.dbName, query);
      return result.docs;
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      return [];
    }
  }

  /**
   * Get recent failed login attempts
   */
  async getFailedLogins(limit = 20) {
    return this.getLogsByType('login_failure', limit);
  }
}

