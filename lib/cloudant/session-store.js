/**
 * Cloudant session store for express-session
 */

import session from 'express-session';

const Store = session.Store;

export class CloudantSessionStore extends Store {
  constructor(options = {}) {
    super(options);
    this.cloudantClient = options.cloudantClient;
    this.dbName = options.dbName || 'maia_sessions';
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default

    if (!this.cloudantClient) {
      throw new Error('CloudantClient is required');
    }
  }

  /**
   * Get session from Cloudant
   * Uses userId as _id for easy viewing in Cloudant dashboard
   */
  async get(sessionId, callback) {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        if (callback) callback(null, null);
        return;
      }

      const cleanSessionId = sessionId.trim();
      if (!cleanSessionId || cleanSessionId === 'undefined') {
        if (callback) callback(null, null);
        return;
      }

      // First, find the session mapping to get userId
      const mappingId = `session_${cleanSessionId}`;
      let mappingDoc;
      try {
        mappingDoc = await this.cloudantClient.getDocument(this.dbName, mappingId);
      } catch (error) {
        // Mapping doesn't exist
        if (callback) callback(null, null);
        return;
      }

      if (!mappingDoc || !mappingDoc.userId) {
        if (callback) callback(null, null);
        return;
      }

      // Get the actual session document using userId as _id
      const sessionDoc = await this.cloudantClient.getDocument(this.dbName, mappingDoc.userId);

      if (!sessionDoc || !sessionDoc.isActive || sessionDoc.sessionId !== cleanSessionId) {
        if (callback) callback(null, null);
        return;
      }

      // Check if session has expired
      const now = new Date();
      const lastActivity = new Date(sessionDoc.lastActivity);

      if ((now - lastActivity) > this.ttl) {
        await this.destroy(cleanSessionId, () => {});
        if (callback) callback(null, null);
        return;
      }

      const sessionData = {
        userId: sessionDoc.userId,
        username: sessionDoc.username,
        displayName: sessionDoc.displayName,
        sessionType: sessionDoc.sessionType,
        lastActivity: sessionDoc.lastActivity,
        createdAt: sessionDoc.createdAt,
        expiresAt: sessionDoc.expiresAt,
        authenticatedAt: sessionDoc.authenticatedAt,
        cookie: {
          expires: new Date(sessionDoc.expiresAt)
        }
      };

      if (callback) callback(null, sessionData);
    } catch (error) {
      if (callback) callback(error, null);
    }
  }

  /**
   * Set session in Cloudant
   * Uses userId as _id for easy viewing in Cloudant dashboard
   */
  async set(sessionId, sessionData, callback) {
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        if (callback) callback(new Error('Invalid sessionId'));
        return;
      }

      const cleanSessionId = sessionId.trim();
      if (!cleanSessionId || cleanSessionId === 'undefined') {
        if (callback) callback(new Error('Invalid sessionId value'));
        return;
      }

      if (!sessionData.userId) {
        if (callback) callback(new Error('userId required in sessionData'));
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.ttl);

      // Main session document with userId as _id
      const sessionDoc = {
        _id: sessionData.userId,
        sessionId: cleanSessionId,
        isActive: true,
        userId: sessionData.userId,
        username: sessionData.username,
        displayName: sessionData.displayName,
        sessionType: sessionData.sessionType || 'authenticated',
        lastActivity: now.toISOString(),
        createdAt: sessionData.createdAt || now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        authenticatedAt: sessionData.authenticatedAt
      };

      // Mapping document for sessionId -> userId lookup
      const mappingDoc = {
        _id: `session_${cleanSessionId}`,
        userId: sessionData.userId,
        type: 'session_mapping'
      };

      // Save both documents
      await this.cloudantClient.saveDocument(this.dbName, sessionDoc);
      await this.cloudantClient.saveDocument(this.dbName, mappingDoc);
      
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
    }
  }

  /**
   * Destroy session
   */
  async destroy(sessionId, callback) {
    try {
      const cleanSessionId = sessionId.trim();
      const mappingId = `session_${cleanSessionId}`;
      
      // Get mapping to find userId
      try {
        const mappingDoc = await this.cloudantClient.getDocument(this.dbName, mappingId);
        if (mappingDoc && mappingDoc.userId) {
          // Delete main session document
          try {
            await this.cloudantClient.deleteDocument(this.dbName, mappingDoc.userId);
          } catch (error) {
            // Session doc might not exist, that's okay
          }
        }
      } catch (error) {
        // Mapping doesn't exist, that's okay
      }
      
      // Delete mapping document
      try {
        await this.cloudantClient.deleteDocument(this.dbName, mappingId);
      } catch (error) {
        // Mapping might not exist, that's okay
      }
      
      if (callback) callback(null);
    } catch (error) {
      // If document doesn't exist, that's okay for destroy operations
      if (callback) callback(null);
    }
  }

  /**
   * Touch session (update lastActivity)
   */
  async touch(sessionId, sessionData, callback) {
    try {
      const cleanSessionId = sessionId.trim();
      const mappingId = `session_${cleanSessionId}`;
      
      // Get mapping to find userId
      try {
        const mappingDoc = await this.cloudantClient.getDocument(this.dbName, mappingId);
        if (mappingDoc && mappingDoc.userId) {
          const sessionDoc = await this.cloudantClient.getDocument(this.dbName, mappingDoc.userId);
          if (sessionDoc) {
            sessionDoc.lastActivity = new Date().toISOString();
            await this.cloudantClient.saveDocument(this.dbName, sessionDoc);
          }
        }
      } catch (error) {
        // Document doesn't exist, that's okay for touch operations
      }
      
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
    }
  }

  /**
   * Get all sessions
   */
  async all(callback) {
    try {
      const query = {
        selector: {
          isActive: true,
          type: { $exists: false } // Exclude mapping documents
        }
      };
      
      const result = await this.cloudantClient.findDocuments(this.dbName, query);
      const sessions = {};
      
      result.docs.forEach(doc => {
        // Use sessionId from doc, fallback to _id if sessionId doesn't exist
        const sessionId = doc.sessionId || doc._id;
        sessions[sessionId] = {
          userId: doc.userId,
          username: doc.username,
          displayName: doc.displayName,
          sessionType: doc.sessionType,
          lastActivity: doc.lastActivity,
          createdAt: doc.createdAt,
          authenticatedAt: doc.authenticatedAt
        };
      });
      
      if (callback) callback(null, sessions);
    } catch (error) {
      if (callback) callback(error, null);
    }
  }

  /**
   * Get session count
   */
  async length(callback) {
    try {
      const query = {
        selector: {
          isActive: true,
          type: { $exists: false } // Exclude mapping documents
        }
      };
      
      const result = await this.cloudantClient.findDocuments(this.dbName, query);
      if (callback) callback(null, result.docs.length);
    } catch (error) {
      if (callback) callback(error, null);
    }
  }
}

