const { google } = require('googleapis');
const UserIntegration = require('../models/UserIntegration');
const CalendarEvent = require('../models/CalendarEvent');
const CalendarSyncLog = require('../models/CalendarSyncLog');

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI || 'http://localhost:5001/api/calendar/oauth2callback';

const isGoogleOAuthEnabled = 
    process.env.ENABLE_GOOGLE_OAUTH !== 'false' && 
    Boolean(process.env.GOOGLE_CLIENT_ID) && 
    Boolean(process.env.GOOGLE_CLIENT_SECRET);

let oAuth2Client = null;
if (isGoogleOAuthEnabled) {
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
}

const SCOPES = ['https://www.googleapis.com/auth/calendar.app.created'];

exports.googleAuth = async (req, res) => {
    if (!isGoogleOAuthEnabled) {
        return res.status(400).json({ success: false, message: "Google OAuth integration is disabled on this server." });
    }
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state: req.user.id
    });
    res.redirect(authUrl);
};

exports.googleAuthCallback = async (req, res) => {
    if (!isGoogleOAuthEnabled) {
        return res.status(400).json({ success: false, message: "Google OAuth integration is disabled on this server." });
    }

    const code = req.query.code;
    const userId = req.query.state;
    if (!code || !userId) {
        return res.status(400).send('Missing code or state');
    }

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        let integration = await UserIntegration.findOne({ userId });
        let googleCalendarId = integration ? integration.googleCalendarId : null;

        if (!googleCalendarId) {
            const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
            const newCal = await calendar.calendars.insert({
                requestBody: { summary: 'PM-Tool Schedule' }
            });
            googleCalendarId = newCal.data.id;
        }

        const updateData = {
            googleAccessToken: tokens.access_token,
            googleTokenExpiry: tokens.expiry_date,
            googleCalendarId
        };
        if (tokens.refresh_token) {
            updateData.googleRefreshToken = tokens.refresh_token;
        }

        await UserIntegration.findOneAndUpdate(
            { userId },
            updateData,
            { upsert: true, new: true }
        );

        // Return success script to close window or redirect
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Google Calendar Connected</title>
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f3f4f6; color: #1f2937; }
                    .card { text-align: center; padding: 2.5rem; background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); max-width: 400px; width: 90%; }
                    h1 { margin-top: 0; font-size: 1.5rem; color: #10b981; }
                    p { color: #6b7280; margin-bottom: 0; }
                    svg { width: 64px; height: 64px; margin-bottom: 1rem; fill: #10b981; }
                </style>
            </head>
            <body>
                <div class="card">
                    <svg viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                    <h1>Successfully Connected!</h1>
                    <p>Your Google Calendar is now integrated. This window will close automatically.</p>
                </div>
                <script>
                    window.opener?.postMessage("google_calendar_connected", "*");
                    setTimeout(() => window.close(), 3000);
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error retrieving access token', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authentication Failed</title>
                <style>
                    body { font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f3f4f6; color: #1f2937; }
                    .card { text-align: center; padding: 2.5rem; background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); max-width: 400px; width: 90%; }
                    h1 { margin-top: 0; font-size: 1.5rem; color: #ef4444; }
                    p { color: #6b7280; margin-bottom: 0; }
                    svg { width: 64px; height: 64px; margin-bottom: 1rem; fill: #ef4444; }
                </style>
            </head>
            <body>
                <div class="card">
                    <svg viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                    <h1>Authentication Failed</h1>
                    <p>There was an error connecting your calendar. Please close this window and try again.</p>
                </div>
            </body>
            </html>
        `);
    }
};

const getOAuthClientForUser = async (userId) => {
    if (!isGoogleOAuthEnabled) return { client: null, googleCalendarId: null };
    if (!userId) return { client: null, googleCalendarId: null };
    const integration = await UserIntegration.findOne({ userId });
    if (!integration || !integration.googleRefreshToken || !integration.googleCalendarId) return { client: null, googleCalendarId: null };

    const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
    client.setCredentials({
        access_token: integration.googleAccessToken,
        refresh_token: integration.googleRefreshToken,
        expiry_date: integration.googleTokenExpiry
    });

    client.on('tokens', async (tokens) => {
        if (tokens.refresh_token) {
            integration.googleRefreshToken = tokens.refresh_token;
        }
        integration.googleAccessToken = tokens.access_token;
        integration.googleTokenExpiry = tokens.expiry_date;
        await integration.save();
    });

    return { client, googleCalendarId: integration.googleCalendarId };
};

exports.getEventsInRange = async (req, res) => {
    const { workspace_id, start_date, end_date } = req.query;
    if (!workspace_id) return res.status(400).json({ error: "Missing workspace_id" });

    try {
        const query = { workspace_id, deleted_at: null };
        if (start_date) query.end_date = { $gte: new Date(start_date) };
        if (end_date) query.start_date = { $lte: new Date(end_date) };

        const localEvents = await CalendarEvent.find(query);
        let allEvents = localEvents.map(e => {
            const ev = e.toJSON();
            // ensure id is string
            ev.id = ev.id || (e._id ? e._id.toString() : '');
            return ev;
        });

        const { client, googleCalendarId } = await getOAuthClientForUser(req.user.id);
        if (client && googleCalendarId) {
            const calendar = google.calendar({ version: 'v3', auth: client });
            const googleEvents = await calendar.events.list({
                calendarId: googleCalendarId,
                timeMin: start_date ? new Date(start_date).toISOString() : new Date().toISOString(),
                timeMax: end_date ? new Date(end_date).toISOString() : undefined,
                singleEvents: true,
                orderBy: 'startTime',
            }).catch(e => { console.error("Google list error:", e); return null; });

            if (googleEvents && googleEvents.data && googleEvents.data.items) {
                const gEvents = googleEvents.data.items.map(item => ({
                    id: `google-${item.id}`,
                    workspace_id,
                    event_type: 'meeting',
                    title: item.summary || 'Google Event',
                    description: item.description,
                    start_date: item.start?.dateTime || item.start?.date,
                    end_date: item.end?.dateTime || item.end?.date,
                    capacity_impact: 1,
                    is_recurring: false,
                    timezone: item.start?.timeZone || 'UTC',
                    auto_generated: false,
                    source_id: item.id,
                    source_table: 'google_calendar',
                    google_event_id: item.id
                }));

                const existingGoogleIds = new Set(allEvents.map(e => e.google_event_id).filter(Boolean));
                const filteredGEvents = gEvents.filter(ge => !existingGoogleIds.has(ge.google_event_id));

                allEvents = [...allEvents, ...filteredGEvents];
            }
        }

        res.json(allEvents);
    } catch (error) {
        console.error('getEventsInRange Error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch events' });
    }
};

exports.createEvent = async (req, res) => {
    try {
        const { client, googleCalendarId } = await getOAuthClientForUser(req.user.id);
        let googleEventId = null;

        if (client && googleCalendarId && req.body.start_date && req.body.end_date) {
            const calendar = google.calendar({ version: 'v3', auth: client });
            const gEvent = await calendar.events.insert({
                calendarId: googleCalendarId,
                requestBody: {
                    summary: req.body.title,
                    description: req.body.description,
                    start: { dateTime: new Date(req.body.start_date).toISOString() },
                    end: { dateTime: new Date(req.body.end_date).toISOString() },
                }
            }).catch(e => console.error("Google insert error:", e));
            if (gEvent && gEvent.data) googleEventId = gEvent.data.id;
        }

        const event = new CalendarEvent({ ...req.body, google_event_id: googleEventId });
        await event.save();
        const responseEvent = event.toJSON();
        // id is populated by Mongoose virtuals
        res.json(responseEvent);
    } catch (error) {
        console.error('createEvent Error:', error);
        res.status(500).json({ error: error.message || 'Failed to create event' });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await CalendarEvent.findById(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const updated = await CalendarEvent.findByIdAndUpdate(id, { ...req.body, updated_at: new Date() }, { new: true });

        if (updated.google_event_id) {
            const { client, googleCalendarId } = await getOAuthClientForUser(req.user.id);
            if (client && googleCalendarId) {
                const calendar = google.calendar({ version: 'v3', auth: client });
                await calendar.events.update({
                    calendarId: googleCalendarId,
                    eventId: updated.google_event_id,
                    requestBody: {
                        summary: updated.title,
                        description: updated.description,
                        start: { dateTime: new Date(updated.start_date).toISOString() },
                        end: { dateTime: new Date(updated.end_date).toISOString() },
                    }
                }).catch(e => console.error("Google update error:", e));
            }
        }

        const responseEvent = updated.toJSON();
        // id is populated by Mongoose virtuals
        res.json(responseEvent);
    } catch (error) {
        console.error('updateEvent Error:', error);
        res.status(500).json({ error: error.message || 'Failed to update event' });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await CalendarEvent.findById(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });

        existing.deleted_at = new Date();
        await existing.save();

        if (existing.google_event_id) {
            const { client, googleCalendarId } = await getOAuthClientForUser(req.user.id);
            if (client && googleCalendarId) {
                const calendar = google.calendar({ version: 'v3', auth: client });
                await calendar.events.delete({
                    calendarId: googleCalendarId,
                    eventId: existing.google_event_id
                }).catch(e => console.error("Google delete error:", e));
            }
        }

        const responseEvent = existing.toJSON();
        // id is populated by Mongoose virtuals
        res.json(responseEvent);
    } catch (error) {
        console.error('deleteEvent Error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete event' });
    }
};

exports.upsertBySourceKey = async (req, res) => {
    try {
        const { workspace_id, source_table, source_id } = req.body;
        if (!workspace_id || !source_table || !source_id) {
            return res.status(400).json({ error: 'Missing keys' });
        }

        let existing = await CalendarEvent.findOne({ workspace_id, source_table, source_id }).sort({ deleted_at: 1, created_at: -1 });

        if (existing) {
            const updated = await CalendarEvent.findByIdAndUpdate(existing._id, { ...req.body, deleted_at: null, updated_at: new Date() }, { new: true });
            const responseEvent = updated.toJSON();
            // id is populated by Mongoose virtuals
            return res.json({ event: responseEvent, created: false });
        } else {
            let googleEventId = null;
            const { client, googleCalendarId } = await getOAuthClientForUser(req.user.id);
            if (client && googleCalendarId && req.body.start_date && req.body.end_date) {
                const calendar = google.calendar({ version: 'v3', auth: client });
                const gEvent = await calendar.events.insert({
                    calendarId: googleCalendarId,
                    requestBody: {
                        summary: req.body.title,
                        description: req.body.description,
                        start: { dateTime: new Date(req.body.start_date).toISOString() },
                        end: { dateTime: new Date(req.body.end_date).toISOString() },
                    }
                }).catch(e => console.error("Google insert error:", e));
                if (gEvent && gEvent.data) googleEventId = gEvent.data.id;
            }

            const event = new CalendarEvent({ ...req.body, google_event_id: googleEventId });
            await event.save();
            const responseEvent = event.toJSON();
            // id is populated by Mongoose virtuals
            return res.json({ event: responseEvent, created: true });
        }
    } catch (error) {
        console.error('upsertBySourceKey Error:', error);
        res.status(500).json({ error: error.message || 'Failed to upsert event' });
    }
};

exports.getSyncLogs = async (req, res) => {
    try {
        const { workspace_id, limit, year } = req.query;
        if (!workspace_id) return res.status(400).json({ error: "Missing workspace_id" });
        const query = { workspace_id };
        if (year) query.year = parseInt(year, 10);
        const logs = await CalendarSyncLog.find(query).sort({ created_at: -1 }).limit(parseInt(limit, 10) || 20);
        res.json(logs);
    } catch (error) {
        console.error('getSyncLogs Error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch sync logs' });
    }
};

exports.appendSyncLog = async (req, res) => {
    try {
        const { workspace_id } = req.body;
        if (!workspace_id) return res.status(400).json({ error: "Missing workspace_id" });
        const log = new CalendarSyncLog(req.body);
        await log.save();
        res.json(log);
    } catch (error) {
        console.error('appendSyncLog Error:', error);
        res.status(500).json({ error: error.message || 'Failed to append sync log' });
    }
};

exports.getConfig = async (req, res) => {
    res.json({ googleOAuthEnabled: isGoogleOAuthEnabled });
};
