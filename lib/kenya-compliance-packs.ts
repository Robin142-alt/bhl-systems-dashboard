export type CompliancePackId = "tax-payroll" | "statutory-core";

export interface CompliancePackTaskDraft {
  title: string;
  deadline: Date;
  frequency: string;
  category: string;
  remindDaysBefore: number;
}

export interface CompliancePackDefinition {
  id: CompliancePackId;
  name: string;
  description: string;
  assumptions: string[];
  useCase: string;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-KE", { month: "long" });

function monthLabel(month: number) {
  return MONTH_FORMATTER.format(new Date(Date.UTC(2026, month - 1, 1)));
}

function monthlyTasks(options: {
  title: string;
  category: string;
  dueDay: number;
  year: number;
  remindDaysBefore: number;
}) {
  const { title, category, dueDay, year, remindDaysBefore } = options;

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;

    return {
      title: `${title} - ${monthLabel(month)} ${year}`,
      deadline: new Date(Date.UTC(year, month - 1, dueDay, 9, 0, 0)),
      frequency: "Monthly",
      category,
      remindDaysBefore,
    } satisfies CompliancePackTaskDraft;
  });
}

function singleTask(options: {
  title: string;
  category: string;
  year: number;
  month: number;
  day: number;
  frequency: string;
  remindDaysBefore: number;
}) {
  const { title, category, year, month, day, frequency, remindDaysBefore } = options;

  return {
    title: `${title} - ${year}`,
    deadline: new Date(Date.UTC(year, month - 1, day, 9, 0, 0)),
    frequency,
    category,
    remindDaysBefore,
  } satisfies CompliancePackTaskDraft;
}

function repeatedTasks(
  title: string,
  category: string,
  year: number,
  remindDaysBefore: number,
  frequency: string,
  dates: Array<{ month: number; day: number; label: string }>,
) {
  return dates.map((date) => ({
    title: `${title} - ${date.label} ${year}`,
    deadline: new Date(Date.UTC(year, date.month - 1, date.day, 9, 0, 0)),
    frequency,
    category,
    remindDaysBefore,
  })) satisfies CompliancePackTaskDraft[];
}

export const compliancePackCatalog: CompliancePackDefinition[] = [
  {
    id: "tax-payroll",
    name: "Tax + Payroll Pack",
    description:
      "Monthly PAYE, NSSF, SHA, VAT, plus the main company income tax checkpoints most Kenyan businesses track every year.",
    assumptions: [
      "PAYE, NSSF and SHA are generated for the 9th of each month based on the official KRA, NSSF and SHA guidance currently available on April 21, 2026.",
      "VAT is generated for the 20th of each month based on current KRA guidance.",
      "Annual corporation tax checkpoints assume a January to December accounting year.",
    ],
    useCase:
      "Best for SMEs, finance teams, and accounting firms who need a ready-made monthly tax and payroll calendar.",
  },
  {
    id: "statutory-core",
    name: "Statutory Core Pack",
    description:
      "Core Kenya corporate housekeeping from your roadmap: annual returns, CR12 reviews, permits and compliance hygiene reminders.",
    assumptions: [
      "This pack follows the dates in your current product brief and should be reviewed against the organisation's county and registrar requirements before rollout.",
      "Permit and workplace dates can vary by county, sector or licence type.",
    ],
    useCase:
      "Best for admins and operations managers who want a starter pack for non-tax compliance work.",
  },
];

export function getCompliancePackDefinition(packId: CompliancePackId) {
  return compliancePackCatalog.find((pack) => pack.id === packId);
}

export function buildCompliancePackTasks(
  packId: CompliancePackId,
  year: number,
): CompliancePackTaskDraft[] {
  if (packId === "tax-payroll") {
    return [
      ...monthlyTasks({
        title: "PAYE Return",
        category: "Tax",
        dueDay: 9,
        year,
        remindDaysBefore: 3,
      }),
      ...monthlyTasks({
        title: "NSSF Contribution Remittance",
        category: "Statutory",
        dueDay: 9,
        year,
        remindDaysBefore: 3,
      }),
      ...monthlyTasks({
        title: "SHA Contribution Remittance",
        category: "Statutory",
        dueDay: 9,
        year,
        remindDaysBefore: 3,
      }),
      ...monthlyTasks({
        title: "VAT Return",
        category: "Tax",
        dueDay: 20,
        year,
        remindDaysBefore: 7,
      }),
      singleTask({
        title: "Corporation Tax Balance Payment Review",
        category: "Tax",
        year,
        month: 4,
        day: 30,
        frequency: "Annual",
        remindDaysBefore: 14,
      }),
      singleTask({
        title: "Corporation Tax Return Filing",
        category: "Tax",
        year,
        month: 6,
        day: 30,
        frequency: "Annual",
        remindDaysBefore: 21,
      }),
      ...repeatedTasks(
        "Installment Tax Payment",
        "Tax",
        year,
        14,
        "Quarterly",
        [
          { month: 4, day: 20, label: "Q1" },
          { month: 6, day: 20, label: "Q2" },
          { month: 9, day: 20, label: "Q3" },
          { month: 12, day: 20, label: "Q4" },
        ],
      ),
    ];
  }

  return [
    singleTask({
      title: "Business Permit Renewal",
      category: "Permit",
      year,
      month: 2,
      day: 10,
      frequency: "Annual",
      remindDaysBefore: 30,
    }),
    singleTask({
      title: "Workplace Registration Renewal",
      category: "Permit",
      year,
      month: 2,
      day: 10,
      frequency: "Annual",
      remindDaysBefore: 30,
    }),
    singleTask({
      title: "Sheria House Annual Return",
      category: "Legal",
      year,
      month: 3,
      day: 31,
      frequency: "Annual",
      remindDaysBefore: 21,
    }),
    ...repeatedTasks(
      "CR12 Shareholding and Director Review",
      "Legal",
      year,
      21,
      "Bi-Annual",
      [
        { month: 6, day: 30, label: "H1" },
        { month: 12, day: 31, label: "H2" },
      ],
    ),
    singleTask({
      title: "Company Profile Update Review",
      category: "Operations",
      year,
      month: 9,
      day: 30,
      frequency: "Annual",
      remindDaysBefore: 21,
    }),
    singleTask({
      title: "Tax Compliance Certificate Readiness Check",
      category: "Tax",
      year,
      month: 9,
      day: 30,
      frequency: "Annual",
      remindDaysBefore: 21,
    }),
  ];
}

export function estimateCompliancePackTaskCount(packId: CompliancePackId, year: number) {
  return buildCompliancePackTasks(packId, year).length;
}
