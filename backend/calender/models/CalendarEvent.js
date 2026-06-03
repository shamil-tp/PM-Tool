const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
    workspace_id: { type: String, required: true },
    event_type: { type: String, required: true }, 
    title: { type: String, required: true },
    description: { type: String },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    participants: [{ type: String }],
    capacity_impact: { type: Number, default: 0 },
    is_recurring: { type: Boolean, default: false },
    recurrence_rule: { type: String },
    timezone: { type: String, default: 'UTC' },
    auto_generated: { type: Boolean, default: false },
    capacity_modifier: { type: Number, default: 1 },
    source_id: { type: String },
    source_table: { type: String },
    deleted_at: { type: Date, default: null },
    visibility: { type: String, enum: ['private', 'global', 'team'], default: 'private' },
    owner_id: { type: String, required: true },
    team_id: { type: String }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Ensure we output id instead of _id to match Supabase
calendarEventSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
    }
});

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
