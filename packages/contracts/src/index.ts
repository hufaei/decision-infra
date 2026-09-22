import { type Static, Type } from "@sinclair/typebox";

export const JsonValueSchema = Type.Recursive((value) =>
  Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.Array(value),
    Type.Record(Type.String(), value),
  ]),
);

const StructuredValueSchema = Type.Union([
  Type.String(),
  Type.Record(Type.String(), JsonValueSchema),
  Type.Array(JsonValueSchema),
]);
const InstructionsSchema = Type.Union([
  StructuredValueSchema,
  Type.Null(),
]);
const DescriptionSchema = Type.Union([
  StructuredValueSchema,
  Type.Null(),
]);
const ProbabilitySchema = Type.Number({ minimum: 0, maximum: 1 });

export const ChoiceQuestionSchema = Type.Object({
  type: Type.Literal("choice"),
  instructions: Type.Optional(InstructionsSchema),
  criteria: Type.Record(Type.String({ minLength: 1 }), DescriptionSchema, {
    minProperties: 1,
  }),
});

export const ScoreQuestionSchema = Type.Object({
  type: Type.Literal("score"),
  instructions: Type.Optional(InstructionsSchema),
  criteria: Type.Array(StructuredValueSchema, { minItems: 1 }),
});

export const NoulCriteriaSchema = Type.Object({
  true: Type.Optional(DescriptionSchema),
  false: Type.Optional(DescriptionSchema),
}, { additionalProperties: false });

export const NoulQuestionSchema = Type.Object({
  type: Type.Literal("noul"),
  instructions: Type.Optional(InstructionsSchema),
  criteria: Type.Optional(Type.Union([NoulCriteriaSchema, Type.Null()])),
});

export const QuestionSchema = Type.Union([
  ChoiceQuestionSchema,
  ScoreQuestionSchema,
  NoulQuestionSchema,
]);

export const DecisionRequestSchema = Type.Object({
  model: Type.Optional(Type.String({ minLength: 1 })),
  state: JsonValueSchema,
  questions: Type.Record(Type.String({ minLength: 1 }), QuestionSchema, {
    minProperties: 1,
  }),
});

export const ChoiceAnswerSchema = Type.Object({
  type: Type.Literal("choice"),
  choice: Type.String(),
  probabilities: Type.Record(Type.String(), ProbabilitySchema),
  confidence: ProbabilitySchema,
});

export const ScoreAnswerSchema = Type.Object({
  type: Type.Literal("score"),
  score: Type.Number(),
  probabilities: Type.Record(Type.String(), ProbabilitySchema),
  confidence: ProbabilitySchema,
  legend: Type.Record(Type.String(), StructuredValueSchema),
});

export const NoulAnswerSchema = Type.Object({
  type: Type.Literal("noul"),
  noul: ProbabilitySchema,
});

export const AnswerSchema = Type.Union([
  ChoiceAnswerSchema,
  ScoreAnswerSchema,
  NoulAnswerSchema,
]);

export const UsageSchema = Type.Object({
  input_tokens: Type.Integer({ minimum: 0 }),
  output_tokens: Type.Integer({ minimum: 0 }),
});

export const DecisionResponseSchema = Type.Object({
  model: Type.String({ minLength: 1 }),
  answers: Type.Record(Type.String({ minLength: 1 }), AnswerSchema, {
    minProperties: 1,
  }),
  usage: Type.Optional(UsageSchema),
});

export type JsonValue = Static<typeof JsonValueSchema>;
export type ChoiceQuestion = Static<typeof ChoiceQuestionSchema>;
export type ScoreQuestion = Static<typeof ScoreQuestionSchema>;
export type NoulCriteria = Static<typeof NoulCriteriaSchema>;
export type NoulQuestion = Static<typeof NoulQuestionSchema>;
export type Question = Static<typeof QuestionSchema>;
export type DecisionRequest = Static<typeof DecisionRequestSchema>;
export type ChoiceAnswer = Static<typeof ChoiceAnswerSchema>;
export type ScoreAnswer = Static<typeof ScoreAnswerSchema>;
export type NoulAnswer = Static<typeof NoulAnswerSchema>;
export type Answer = Static<typeof AnswerSchema>;
export type Usage = Static<typeof UsageSchema>;
export type DecisionResponse = Static<typeof DecisionResponseSchema>;
