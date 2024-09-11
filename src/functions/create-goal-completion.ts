import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { goals, goalCompletions } from "../db/schema";
import dayjs from "dayjs";

interface CreateGoalCompletionRequest {
  goalId: string;
}

export async function createGoalCompletion({
  goalId,
}: CreateGoalCompletionRequest) {
  const startDayOfWeek = dayjs().startOf("week").toDate();
  const lastDayOffWeek = dayjs().endOf("week").toDate();

  const goalsCompletionsCounts = db.$with("goals_completions_count").as(
    db
      .select({
        completionCount: count(goalCompletions.id).as("completionCount"),
        goalId: goalCompletions.goalId,
      })
      .from(goalCompletions)
      .where(
        and(
          gte(goalCompletions.createdAt, startDayOfWeek),
          lte(goalCompletions.createdAt, lastDayOffWeek),
          eq(goalCompletions.goalId, goalId)
        )
      )
      .groupBy(goalCompletions.goalId)
  );

  const result = await db
    .with(goalsCompletionsCounts)
    .select({
      desiredWeeklyFrequency: goals.desiredWeeklyFrequency,
      completionCount: sql`
        COALESCE(${goalsCompletionsCounts.completionCount}, 0)
      `.mapWith(Number),
    })
    .from(goals)
    .leftJoin(
      goalsCompletionsCounts,
      eq(goalsCompletionsCounts.goalId, goals.id)
    )
    .where(eq(goals.id, goalId));

  const { completionCount, desiredWeeklyFrequency } = result[0];
  if (completionCount > desiredWeeklyFrequency) {
    throw new Error("Goal already completed this week!");
  }

  const insertResult = await db
    .insert(goalCompletions)
    .values({ goalId })
    .returning();

  const goalCompletion = insertResult[0];

  return { goalCompletion };
}
