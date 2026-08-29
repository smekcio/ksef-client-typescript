import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KsefValidationError,
  normalizeInvoiceQueryFilters,
  validateInvoiceQueryFilters,
} from "../../dist/index.js";

test("validateInvoiceQueryFilters accepts date range up to 100 days UTC", () => {
  assert.doesNotThrow(() => {
    validateInvoiceQueryFilters({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-01",
        to: "2025-04-11",
      },
    });
  });
});

test("validateInvoiceQueryFilters throws KsefValidationError for date range over 100 days UTC", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-01-01",
          to: "2025-04-12",
        },
      }),
    KsefValidationError,
  );
});

test("validateInvoiceQueryFilters throws KsefValidationError for invalid date", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-02-30",
          to: "2025-03-01",
        },
      }),
    KsefValidationError,
  );
});

test("validateInvoiceQueryFilters accepts missing dateRange.to by using current UTC date-time", () => {
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.doesNotThrow(() => {
    validateInvoiceQueryFilters({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: yesterdayIso,
      },
    });
  });
});

test("normalizeInvoiceQueryFilters adds Europe/Warsaw offset for datetime without offset", () => {
  const normalized = normalizeInvoiceQueryFilters({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-02T10:15:00",
      to: "2025-07-02T11:15:00",
    },
  });

  assert.equal(normalized.dateRange.from, "2025-01-02T10:15:00+01:00");
  assert.equal(normalized.dateRange.to, "2025-07-02T11:15:00+02:00");
});

test("normalizeInvoiceQueryFilters leaves non-object filters unchanged", () => {
  const value = "not-an-object";
  assert.equal(normalizeInvoiceQueryFilters(value), value);
});

test("validateInvoiceQueryFilters rejects missing subjectType", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        dateRange: {
          dateType: "Issue",
          from: "2025-01-01",
          to: "2025-01-02",
        },
      }),
    /subjectType/,
  );
});

test("validateInvoiceQueryFilters rejects missing dateRange", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
      }),
    /dateRange is required/,
  );
});

test("validateInvoiceQueryFilters rejects non-object dateRange", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: "invalid",
      }),
    /dateRange must be an object/,
  );
});

test("validateInvoiceQueryFilters rejects dateRange without dateType", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          from: "2025-01-01",
          to: "2025-01-02",
        },
      }),
    /dateType/,
  );
});

test("validateInvoiceQueryFilters rejects blank from value", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: " ",
          to: "2025-01-02",
        },
      }),
    /dateRange.from/,
  );
});

test("validateInvoiceQueryFilters rejects blank to value when provided", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-01-01",
          to: " ",
        },
      }),
    /dateRange.to/,
  );
});

test("validateInvoiceQueryFilters rejects to earlier than from", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-01-03",
          to: "2025-01-02",
        },
      }),
    /greater than or equal/,
  );
});

test("validateInvoiceQueryFilters rejects invalid ISO date-time format", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-01-01T25:00:00",
          to: "2025-01-02T12:00:00",
        },
      }),
    /valid ISO date-time or date string/,
  );
});

test("normalizeInvoiceQueryFilters leaves datetime with existing offset unchanged", () => {
  const normalized = normalizeInvoiceQueryFilters({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-02T10:15:00+01:00",
      to: "2025-07-02T11:15:00Z",
    },
  });

  assert.equal(normalized.dateRange.from, "2025-01-02T10:15:00+01:00");
  assert.equal(normalized.dateRange.to, "2025-07-02T11:15:00Z");
});

test("validateInvoiceQueryFilters rejects non-object root filters", () => {
  assert.throws(() => validateInvoiceQueryFilters("invalid"), /must be an object/);
});

test("normalizeInvoiceQueryFilters leaves invalid calendar datetime without offset unchanged", () => {
  const normalized = normalizeInvoiceQueryFilters({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-02-30T10:15:00",
      to: "2025-02-30T11:15:00",
    },
  });

  assert.equal(normalized.dateRange.from, "2025-02-30T10:15:00");
  assert.equal(normalized.dateRange.to, "2025-02-30T11:15:00");
});

test("validateInvoiceQueryFilters rejects datetime with invalid calendar date", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-02-30T10:15:00+01:00",
          to: "2025-03-01T10:15:00+01:00",
        },
      }),
    /contains an invalid calendar date/,
  );
});

test("validateInvoiceQueryFilters rejects month zero in ISO date", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-00-10",
          to: "2025-01-10",
        },
      }),
    /valid calendar date/,
  );
});

test("normalizeInvoiceQueryFilters handles DST transition timestamps", () => {
  const normalized = normalizeInvoiceQueryFilters({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-03-30T02:30:00",
      to: "2025-03-30T03:30:00",
    },
  });

  assert.match(normalized.dateRange.from, /^2025-03-30T02:30:00[+-]\d{2}:\d{2}$/);
  assert.match(normalized.dateRange.to, /^2025-03-30T03:30:00[+-]\d{2}:\d{2}$/);
});

test("normalizeInvoiceQueryFilters throws for unsupported timezone offset format", () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = class MockDateTimeFormat {
    formatToParts() {
      return [{ type: "timeZoneName", value: "UTC" }];
    }
  };

  try {
    assert.throws(
      () =>
        normalizeInvoiceQueryFilters({
          subjectType: "Subject1",
          dateRange: {
            dateType: "Issue",
            from: "2025-01-02T10:15:00",
            to: "2025-01-02T11:15:00",
          },
        }),
      /Unsupported timezone offset format/,
    );
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test("normalizeInvoiceQueryFilters returns original text when regex exec has no named groups", () => {
  const originalExec = RegExp.prototype.exec;
  RegExp.prototype.exec = function patchedExec(text) {
    if (this.source.includes("(?<year>\\d{4})") && text === "2025-01-02T10:15:00") {
      const result = ["2025-01-02T10:15:00"];
      result.index = 0;
      result.input = text;
      return result;
    }
    return originalExec.call(this, text);
  };

  try {
    const normalized = normalizeInvoiceQueryFilters({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-02T10:15:00",
      },
    });
    assert.equal(normalized.dateRange.from, "2025-01-02T10:15:00");
  } finally {
    RegExp.prototype.exec = originalExec;
  }
});

test("validateInvoiceQueryFilters covers invalid Date parse guard branch", () => {
  const OriginalDate = Date;
  class PatchedDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 1 && args[0] === "2025-01-02T10:15:00+01:00") {
        super(Number.NaN);
        return;
      }
      super(...args);
    }

    static now() {
      return OriginalDate.now();
    }

    static parse(value) {
      return OriginalDate.parse(value);
    }

    static UTC(...args) {
      return OriginalDate.UTC(...args);
    }
  }
  // eslint-disable-next-line no-global-assign
  Date = PatchedDate;
  try {
    assert.throws(
      () =>
        validateInvoiceQueryFilters({
          subjectType: "Subject1",
          dateRange: {
            dateType: "Issue",
            from: "2025-01-01T10:15:00+01:00",
            to: "2025-01-02T10:15:00+01:00",
          },
        }),
      /valid ISO date-time string/,
    );
  } finally {
    // eslint-disable-next-line no-global-assign
    Date = OriginalDate;
  }
});

test("validateInvoiceQueryFilters covers integer guard branch in calendar validation", () => {
  const originalIsInteger = Number.isInteger;
  let calls = 0;
  Number.isInteger = (value) => {
    calls += 1;
    if (calls === 1 && value === 2025) {
      return false;
    }
    return originalIsInteger(value);
  };

  try {
    assert.throws(
      () =>
        validateInvoiceQueryFilters({
          subjectType: "Subject1",
          dateRange: {
            dateType: "Issue",
            from: "2025-01-01",
            to: "2025-01-02",
          },
        }),
      /valid calendar date/,
    );
  } finally {
    Number.isInteger = originalIsInteger;
  }
});

test("normalizeInvoiceQueryFilters handles datetimes without seconds component", () => {
  const normalized = normalizeInvoiceQueryFilters({
    subjectType: "Subject1",
    dateRange: {
      dateType: "Issue",
      from: "2025-01-02T10:15",
    },
  });
  assert.match(normalized.dateRange.from, /^2025-01-02T10:15[+-]\d{2}:\d{2}$/);
});

test("normalizeInvoiceQueryFilters throws when timeZoneName part is missing", () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = class MissingZoneDateTimeFormat {
    formatToParts() {
      return [{ type: "literal", value: "," }];
    }
  };

  try {
    assert.throws(
      () =>
        normalizeInvoiceQueryFilters({
          subjectType: "Subject1",
          dateRange: {
            dateType: "Issue",
            from: "2025-01-02T10:15:00",
          },
        }),
      /Unsupported timezone offset format/,
    );
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test("normalizeInvoiceQueryFilters supports negative timezone offset formatting", () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = class NegativeOffsetDateTimeFormat {
    formatToParts() {
      return [{ type: "timeZoneName", value: "GMT-05:30" }];
    }
  };

  try {
    const normalized = normalizeInvoiceQueryFilters({
      subjectType: "Subject1",
      dateRange: {
        dateType: "Issue",
        from: "2025-01-02T10:15:00",
      },
    });
    assert.equal(normalized.dateRange.from, "2025-01-02T10:15:00-05:30");
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test("validateInvoiceQueryFilters rejects restrictToPermanentStorageHwmDate for non-permanent dateType", () => {
  assert.throws(
    () =>
      validateInvoiceQueryFilters({
        subjectType: "Subject1",
        dateRange: {
          dateType: "Issue",
          from: "2025-01-01",
          to: "2025-01-02",
          restrictToPermanentStorageHwmDate: true,
        },
      }),
    /requires dateType PermanentStorage/,
  );
});
