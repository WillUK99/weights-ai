"use client";

import { getInProgressWorkout } from "@/lib/helper/workout";
import { Card } from "../ui/card";
import { useQuery } from "@tanstack/react-query";

export function CurrentWorkout() {
  const curWorkoutQuery = useQuery({
    queryKey: ["currentWorkout"],
    queryFn: async () => {
      const workout = await getInProgressWorkout();

      if (workout) {
        return workout;
      }
      return null;
    },
    initialData: null,
  });

  if (curWorkoutQuery.isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Card className="md:fixed top-12 right-12 bg-black text-slate-100 py-2 px-6 rounded-full mx-auto block">
      {curWorkoutQuery.data ? (
        // in progress workout real
        <div className="flex flex-row gap-4 items-center">
          <div className="w-3 h-3 bg-green-600 rounded-full"></div>
          <div className="flex flex-col">
            <h2 className="font-bold text-lg">{curWorkoutQuery.data.name}</h2>
            <h4 className="font-light text-sm text-slate-400">
              {curWorkoutQuery.data.location}
            </h4>
          </div>
        </div>
      ) : (
        <div>NO WORKOUT IN PROGRESS</div>
      )}
    </Card>
  );
}
