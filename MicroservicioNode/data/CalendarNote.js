const mongoose = require("mongoose");

const calendarNoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    content: {
      type: String,
      trim: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

calendarNoteSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model("CalendarNote", calendarNoteSchema);
