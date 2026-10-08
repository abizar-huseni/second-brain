"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export const DEFAULT_NAME = "Kairos";

// The name you gave your assistant on the Me page.
export function useAssistantName() {
  const [name, setName] = useState(DEFAULT_NAME);
  useEffect(() => {
    supabase
      .from("profile")
      .select("assistant_name")
      .maybeSingle()
      .then(({ data }) => data?.assistant_name && setName(data.assistant_name));
  }, []);
  return name;
}
