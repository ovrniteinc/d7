"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollupAppUsage = exports.rollupTimeLog = exports.logActivity = exports.updateUserRole = exports.createTeamUser = exports.setupInitialAdmin = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const seed_1 = require("./seed");
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
async function requireAdmin(uid) {
    const profile = await db.collection("profiles").doc(uid).get();
    const data = profile.data();
    if (!data || data.role !== "admin" || data.status !== "active") {
        throw new https_1.HttpsError("permission-denied", "Admin only");
    }
}
async function writeActivityLog(userId, action, entityType, entityId, meta) {
    await db.collection("activity_logs").add({
        user_id: userId,
        action,
        entity_type: entityType || null,
        entity_id: entityId || null,
        meta: meta || {},
        created_at: new Date().toISOString(),
    });
}
exports.setupInitialAdmin = (0, https_1.onCall)(async (request) => {
    const admins = await db.collection("profiles").where("role", "==", "admin").limit(1).get();
    if (!admins.empty) {
        throw new https_1.HttpsError("already-exists", "Admin already exists");
    }
    const email = request.data.email || "admin@district7.local";
    const password = request.data.password || "District7!2024";
    const name = request.data.name || "District Admin";
    if (password.length < 8) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 8 characters");
    }
    await (0, seed_1.seedDefaults)(db);
    const user = await auth.createUser({
        email,
        password,
        displayName: name,
    });
    await auth.setCustomUserClaims(user.uid, { role: "admin" });
    const now = new Date().toISOString();
    await db.collection("profiles").doc(user.uid).set({
        id: user.uid,
        email,
        name,
        title: "Administrator",
        role: "admin",
        status: "active",
        must_reset_password: false,
        avatar_url: null,
        notif_prefs: {},
        created_at: now,
        updated_at: now,
    });
    await writeActivityLog(user.uid, "system.setup_admin", "user", user.uid, { email });
    return { ok: true, email, id: user.uid };
});
exports.createTeamUser = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required");
    await requireAdmin(request.auth.uid);
    const { name, title, email, role, password } = request.data;
    if (!email || !password || !name || !role) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    if (password.length < 8) {
        throw new https_1.HttpsError("invalid-argument", "Password too short");
    }
    if (!["admin", "staff"].includes(role)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid role");
    }
    const user = await auth.createUser({
        email,
        password,
        displayName: name,
    });
    await auth.setCustomUserClaims(user.uid, { role });
    const now = new Date().toISOString();
    await db.collection("profiles").doc(user.uid).set({
        id: user.uid,
        email,
        name,
        title: title || "",
        role,
        status: "active",
        must_reset_password: true,
        avatar_url: null,
        notif_prefs: {},
        created_at: now,
        updated_at: now,
    });
    await writeActivityLog(request.auth.uid, "user.create", "user", user.uid, { email, role, name });
    return { id: user.uid, email, name, role };
});
exports.updateUserRole = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required");
    await requireAdmin(request.auth.uid);
    const { userId, role } = request.data;
    if (!userId || !["admin", "staff"].includes(role)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid request");
    }
    await auth.setCustomUserClaims(userId, { role });
    await db.collection("profiles").doc(userId).update({
        role,
        updated_at: new Date().toISOString(),
    });
    await writeActivityLog(request.auth.uid, "user.role_update", "user", userId, { role });
    return { ok: true };
});
exports.logActivity = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in required");
    const { action, entityType, entityId, meta } = request.data;
    if (!action)
        throw new https_1.HttpsError("invalid-argument", "Missing action");
    await writeActivityLog(request.auth.uid, action, entityType, entityId, meta);
    return { ok: true };
});
exports.rollupTimeLog = (0, https_1.onCall)(async (request) => {
    const { logId } = request.data;
    if (!logId)
        throw new https_1.HttpsError("invalid-argument", "Missing logId");
    const logSnap = await db.collection("time_logs").doc(logId).get();
    const log = logSnap.data();
    if (!log || !log.ended_at || !log.duration_seconds) {
        return { ok: true, skipped: true };
    }
    const dateStr = String(log.started_at).slice(0, 10);
    const focusSeconds = log.source === "timer" ? log.duration_seconds : 0;
    const existingSnap = await db
        .collection("sessions_activity")
        .where("user_id", "==", log.user_id)
        .where("activity_date", "==", dateStr)
        .limit(1)
        .get();
    const existing = existingSnap.docs[0];
    const focus = (existing?.data().focus_seconds || 0) + focusSeconds;
    const idle = existing?.data().idle_seconds || 0;
    const distraction = existing?.data().distraction_seconds || 0;
    const tracked = focus + idle + distraction;
    const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;
    const now = new Date().toISOString();
    if (existing) {
        await existing.ref.update({
            focus_seconds: focus,
            productivity_score: score,
            updated_at: now,
        });
    }
    else {
        await db.collection("sessions_activity").add({
            user_id: log.user_id,
            activity_date: dateStr,
            focus_seconds: focus,
            idle_seconds: 0,
            distraction_seconds: 0,
            productivity_score: score,
            updated_at: now,
        });
    }
    return { ok: true };
});
exports.rollupAppUsage = (0, https_1.onCall)(async (request) => {
    const { usageId } = request.data;
    if (!usageId)
        throw new https_1.HttpsError("invalid-argument", "Missing usageId");
    const usageSnap = await db.collection("app_usage").doc(usageId).get();
    const usage = usageSnap.data();
    if (!usage || !usage.ended_at || !usage.duration_seconds) {
        return { ok: true, skipped: true };
    }
    const dateStr = String(usage.started_at).slice(0, 10);
    const category = usage.category || "neutral";
    const seconds = usage.duration_seconds;
    const existingSnap = await db
        .collection("sessions_activity")
        .where("user_id", "==", usage.user_id)
        .where("activity_date", "==", dateStr)
        .limit(1)
        .get();
    const existing = existingSnap.docs[0];
    const focus = (existing?.data().focus_seconds || 0) + (category === "work" ? seconds : 0);
    const idle = existing?.data().idle_seconds || 0;
    const distraction = (existing?.data().distraction_seconds || 0) + (category === "distraction" ? seconds : 0);
    const tracked = focus + idle + distraction;
    const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;
    const now = new Date().toISOString();
    if (existing) {
        await existing.ref.update({
            focus_seconds: focus,
            distraction_seconds: distraction,
            productivity_score: score,
            updated_at: now,
        });
    }
    else {
        await db.collection("sessions_activity").add({
            user_id: usage.user_id,
            activity_date: dateStr,
            focus_seconds: focus,
            idle_seconds: 0,
            distraction_seconds: distraction,
            productivity_score: score,
            updated_at: now,
        });
    }
    return { ok: true };
});
//# sourceMappingURL=index.js.map