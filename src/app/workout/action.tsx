import { openai, openaiEmbeddingModel } from "@/server/ai";
import { createAI, getMutableAIState, streamUI } from "ai/rsc";
import { ReactNode } from "react";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getOrCreateProfile } from "@/server/helper/auth";
import { SystemMessage } from "@/components/Messages";
import { api } from "@/trpc/server";
import { ManageSchedule } from "@/components/schedule/ManageSchedule";
import { embed } from "ai";
import { db } from "@/server/db";
import { userExercise } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export interface WorkoutServerMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorkoutClientMessage {
  id: string;
  role: "user" | "assistant";
  display: ReactNode;
}

const sendWorkoutMessage = async (
  message: string
): Promise<WorkoutClientMessage> => {
  "use server";

  // ensure that the user is logged in
  const { profile, error } = await getOrCreateProfile();
  if (error || !profile) {
    return {
      id: nanoid(),
      role: "assistant",
      display: <SystemMessage message={error} needsSep={true} />,
    };
  }

  const history = getMutableAIState<typeof WorkoutAI>();

  // const model = groq("llama3-8b-8192");
  const model = openai("gpt-4o", {});

  const result = await streamUI({
    model,
    messages: [...history.get(), { role: "user", content: message }],
    text: ({ content, done }) => {
      if (done) {
        const newHistory: WorkoutServerMessage[] = [
          ...history.get(),
          { role: "assistant", content },
        ];
        history.done(newHistory);
      }

      return <SystemMessage message={content} needsSep={true} />;
    },

    tools: {
      manage_schedule: {
        description:
          "Allow the user to manage their schedule, set which exercises they want to do on each day of the week",
        parameters: z.object({}),
        generate: async function* () {
          yield <div>LOADING...</div>;

          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="You can set which exercises you want to do on each day of the week, and how many sets you want to do for each exercise."
              />
              <ManageSchedule />
            </div>
          );
        },
      },

      add_set: {
        description: "Call this function to add a set to the user's workout",
        parameters: z.object({
          weight: z.number().describe("the weight of the user's set"),
          reps: z.number().describe("the number of reps for the user's set"),
          exercise: z
            .string()
            .describe("the name of the user's exercise, ex. bench press"),
        }),
        generate: async function* (params) {
          yield <div>Adding set to workout...</div>;

          // figure out the user set id
          // search using the edge function

          const { embedding } = await embed({
            model: openaiEmbeddingModel,
            value: params.exercise,
          });

          const dbExercises = await db.select({
            name: userExercise.name,
            id: userExercise.id,
          }).from(userExercise).where(eq(userExercise.profileId, profile.id))
            .orderBy(
              sql`name_openai_embedding <=> ${JSON.stringify(
                embedding,
              )
                }`,
            ).limit(1);


          if (dbExercises.length === 0) {
            return (
              <SystemMessage
                needsSep={true}
                message="I couldn't find that exercise, please try again!"
              />
            );
          }

          api.sets.saveNewSets({
            sets: [
              {
                weight: params.weight,
                reps: params.reps,
                exerciseId: dbExercises[0].id,
              },
            ],
          });

          return (
            <SystemMessage
              message={`Added ${params.exercise}!`}
              needsSep={true}
            />
          );
        },
      },
    },
  });

  return {
    id: nanoid(),
    role: "assistant",
    display: result.value,
  };
};

export const WorkoutAI = createAI<
  WorkoutServerMessage[],
  WorkoutClientMessage[]
>({
  actions: {
    sendWorkoutMessage,
  },
  initialAIState: [],
  initialUIState: [],
});
