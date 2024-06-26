"use client";

import { Card, CardContent } from "../ui/card";
import { Separator } from "../ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import { useRef, useState } from "react";
import { Trash } from "lucide-react";
import { api } from "@/trpc/react";

type WorkoutBreakdownProps = {
  workoutInfo: {
    date: Date;
    id: string;
    name: string;
    profileId: string;
    location: string;
    inProgress: boolean;
    endedAt: Date | null;
    sets: {
      id: string;
      userExercise: {
        name: string;
      };
      createdAt: Date;
      userExerciseId: string;
      weight: number;
      reps: number;
      workoutId: string;
    }[];
  };
};

export function WorkoutBreakdown(props: WorkoutBreakdownProps) {
  const { workoutInfo } = props;

  const [sets, setSets] = useState(workoutInfo.sets);

  const deletedSetIdx = useRef(0);

  const deleteSetMutation = api.sets.deleteSet.useMutation({
    onSuccess: () => {
      const copy = sets;

      copy.splice(deletedSetIdx.current, 1);

      setSets([...copy]);
    },
  });

  const submitDelete = async (id: string, idx: number) => {
    deletedSetIdx.current = idx;
    deleteSetMutation.mutate({ setId: id });
  };

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg text-slate-800 font-bold">{workoutInfo.name}</h2>
        <h4 className="text-slate-600 font-light">
          {workoutInfo.date.toLocaleDateString()} -{" "}
          <span className="italic">{workoutInfo.location}</span>
        </h4>
        <Separator />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lift</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Reps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* goofy but whatever */}
            {sets.map((set, i) => {
              return (
                <TableRow key={set.id}>
                  <TableCell className="font-semibold">
                    {set.userExercise.name}
                  </TableCell>
                  <TableCell>{set.weight}</TableCell>
                  <TableCell>{set.reps}</TableCell>
                  <TableCell>
                    <Button onClick={() => submitDelete(set.id, i)}>
                      <Trash className="w-5 h-5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
