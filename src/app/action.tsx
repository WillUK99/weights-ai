import "server-only";
import { OpenAI } from "openai";
import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  render,
} from "ai/rsc";
import z from "zod";
import CreateWorkoutCard from "@/components/workout/CreateWorkoutCard";
import { SystemMessage } from "@/components/Messages";
import ViewAllWorkouts from "@/components/workout/ViewAllWorkouts";
import { AddExerciseCardServer } from "@/components/exercise/AddExerciseCardServer";
import { WorkoutBreakdown } from "@/components/workout/WorkoutBreakdown";
import { Suspense } from "react";
import { TestRSC } from "@/components/TestRSC";
import CompleteWorkoutCard from "@/components/workout/CompleteWorkoutCard";
import {
  getAllWorkouts,
  getInProgressWorkout,
  getWorkoutInfo,
} from "@/server/helper/workout";
import { ManageSchedule } from "@/components/schedule/ManageSchedule";
import { OneDaySchedule } from "@/components/schedule/OneDaySchedule";
import { getUserScheduleOneDay } from "@/server/helper/schedule";
import { getOrCreateProfile } from "@/server/helper/auth";
import { env } from "@/env";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

async function submitUserMessage(userInput: string) {
  "use server";

  // ensure that the user is logged in
  const { profile, error } = await getOrCreateProfile();
  if (error || !profile) {
    return {
      id: Date.now(),
      display: <SystemMessage message={error} needsSep={true} />,
    };
  }

  if (profile.role === "user") {
    return {
      id: Date.now(),
      display: (
        <SystemMessage
          message="Weights AI is not currently available for users. Please contact me for access, or try again later!"
          needsSep={true}
        />
      ),
    };
  }

  const aiState = getMutableAIState<typeof AI>();

  aiState.update([
    ...aiState.get(),
    {
      role: "user",
      content: userInput,
    },
  ]);

  const ui = render({
    model: "gpt-3.5-turbo",
    provider: openai,
    messages: [
      {
        role: "system",
        content: `\
        You are a personal weights tracker for the gym. You can be asked to start workouts, and to record information for a users sets.
  If you can't find an appropriate function, tell the user to ask
  a different question.
    `,
      },
      { role: "user", content: userInput },
    ],
    text: ({ content, done }) => {
      if (done) {
        aiState.done([
          ...aiState.get(),
          {
            role: "assistant",
            content,
          },
        ]);
      }
      return <SystemMessage message={content} needsSep={true} />;
    },
    tools: {
      rsc_demo: {
        description:
          "Call this function when the user types 'demo' this is for debugging",
        parameters: z.object({}),
        render: async function* () {
          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "rsc_demo",
              content: "the user called rsc_demo, this is a debugging function",
            },
          ]);

          const streamUI = createStreamableUI(<div>test start</div>);

          streamUI.update(
            <div>
              <h2>this does work?</h2>
              <Suspense fallback={<div>LOADING TEST RSC?!?!?!?</div>}>
                <TestRSC />
              </Suspense>
            </div>
          );

          return streamUI.value;
        },
      },
      view_current_workout: {
        description:
          "Allows the user to view their current workout and its information",
        parameters: z.object({}),
        render: async function* () {
          yield <div>fetching...</div>;

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "view_current_workout",
              content:
                "user has been given a card to view the status of their current workout",
            },
          ]);

          const curWorkout = await getInProgressWorkout();

          if (!curWorkout) {
            return (
              <SystemMessage
                needsSep={true}
                message="No currently active workout..."
              />
            );
          }

          const workoutInfo = await getWorkoutInfo(curWorkout.id);
          if (!workoutInfo) {
            return (
              <SystemMessage
                needsSep={true}
                message="No currently active workout..."
              />
            );
          }

          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="Here is your current workout:"
              />
              <WorkoutBreakdown workoutInfo={workoutInfo} />
            </div>
          );
        },
      },
      add_sets: {
        description:
          "Allow the user to input their set. Fill in the exercise, reps, and weight. If they fail to provide any of these, you can ask them to try again.",
        parameters: z
          .object({
            exercise: z.string().describe("The exercise the user did"),
            reps: z
              .number()
              .describe("The number of reps they did of that exercise"),
            weight: z
              .number()
              .describe("The amount of weight that the user did"),
          })
          .required(),
        render: async function* (props) {
          yield <div>fetching...</div>;

          // check if there is a current workout
          const curWorkout = await getInProgressWorkout();

          if (!curWorkout) {
            return (
              <SystemMessage
                needsSep={true}
                message="No currently active workout..."
              />
            );
          }

          const sendData: {
            exerciseId: string;
            reps: number;
            weight: number;
          }[] = [];

          // search using the edge function
          const supabaseURL = env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          const res = await fetch(
            `${supabaseURL}/functions/v1/search-exercise`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseAnonKey}`,
              },
              body: JSON.stringify({
                search: props.exercise,
                profile_id: profile.id,
              }),
            }
          );

          const data = (await res.json()) as {
            search: string;
            result: {
              name: string;
              id: string;
            }[];
          };

          if (!data.result.length) {
            return (
              <SystemMessage
                needsSep={true}
                message="I couldn't find that exercise, please try again!"
              />
            );
          }

          const selectedExercise = data.result[0];

          sendData.push({
            exerciseId: selectedExercise.id,
            reps: props.reps,
            weight: props.weight,
          });

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "add_sets",
              content:
                "provided the UI for the user to add sets to their workout",
            },
          ]);

          // need to make this stream-able so that suspense works
          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="Add your set here, once you are done go ahead and hit save!"
              />
              <AddExerciseCardServer initState={sendData} />
            </div>
          );
        },
      },
      view_all_workouts: {
        description:
          "Allow the user to view all of their past workouts in a nice table",
        parameters: z.object({}),
        render: async function* () {
          yield <div>fetching...</div>;

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "create_new_workout",
              content: "provided the UI for the user to view their workouts",
            },
          ]);

          const workouts = await getAllWorkouts();

          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="Here are all of your workouts!"
              />
              <ViewAllWorkouts workouts={workouts} />
            </div>
          );
        },
      },
      complete_workout: {
        description: "Allow the user to finish/complete their workout",
        parameters: z.object({}),
        render: async function* () {
          yield <div>fetching...</div>;

          const curWorkout = await getInProgressWorkout();

          if (!curWorkout) {
            aiState.done([
              ...aiState.get(),
              {
                role: "function",
                name: "complete_workout",
                content:
                  "the user does not have a currently active workout, so we cannot complete it",
              },
            ]);
            return (
              <SystemMessage
                needsSep={true}
                message="No currently active workout..."
              />
            );
          }

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "complete_workout",
              content: "provided the UI for the user to complete their workout",
            },
          ]);

          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="Are you ready to finish your workout?"
              />
              <CompleteWorkoutCard workoutId={curWorkout.id} />
            </div>
          );
        },
      },
      create_new_workout: {
        description:
          "Provide the user with the UI to create a new workout, this is NOT for when the user wants to add an exercise like bench press",
        parameters: z.object({}),
        render: async function* () {
          yield <div>LOADING...</div>;

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "create_new_workout",
              content: "provided the UI for the user to create a new workout",
            },
          ]);

          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="Lets get your workout info ready, once you submit, your workout will automatically start!"
              />
              <CreateWorkoutCard />
            </div>
          );
        },
      },
      get_todays_schedule: {
        description: "Allow the user to view their schedule for today",
        parameters: z.object({}),
        render: async function* () {
          yield <div>fetching...</div>;

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "get_todays_schedule",
              content: "provided the UI for the user to view their schedule",
            },
          ]);

          const schedule = await getUserScheduleOneDay(new Date().getDay());

          if (!schedule.data) {
            return (
              <SystemMessage
                needsSep={true}
                message="No schedule found for today..."
              />
            );
          }

          return (
            <div>
              <SystemMessage
                needsSep={false}
                message="Here is your schedule for today:"
              />
              <OneDaySchedule entry={schedule.data} />
            </div>
          );
        },
      },
      manage_schedule: {
        description:
          "Allow the user to manage their schedule, set which exercises they want to do on each day of the week",
        parameters: z.object({}),
        render: async function* () {
          yield <div>LOADING...</div>;

          aiState.done([
            ...aiState.get(),
            {
              role: "function",
              name: "manage_schedule",
              content: "provided the UI for the user to manage their schedule",
            },
          ]);

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
    },
  });
  return {
    id: Date.now(),
    display: ui,
  };
}

export const initialAIState: {
  role: "user" | "assistant" | "system" | "function";
  content: string;
  id?: string;
  name?: string;
}[] = [];

export const initialUIState: {
  id: number;
  display: React.ReactNode;
}[] = [
  {
    id: Date.now(),
    display: (
      <SystemMessage
        message=""
        needsSep={true}
        richMessage={
          <div className="flex flex-col gap-2">
            <p className="text-neutral-900 text-lg italic">
              Hi! I am a personal workout logging system.
            </p>
            <p>Right how I have three main functions:</p>
            <p className="font-bold">1. Create a new workout</p>
            <p className="font-bold">2. Add sets to a workout</p>
            <p className="font-bold">3. Manage your schedule</p>
            <p>
              Before you start your workout, you first need to create your
              schedule, then create your workout, then you are ready to go!
            </p>
          </div>
        }
      />
    ),
  },
];

export const AI = createAI({
  actions: {
    submitUserMessage,
  },
  initialUIState,
  initialAIState,
});
