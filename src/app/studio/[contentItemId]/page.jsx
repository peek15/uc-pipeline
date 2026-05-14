"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/db";
import StudioWorkspace from "@/components/studio/StudioWorkspace";

export default function StudioPage() {
  const params = useParams();
  const contentItemId = params?.contentItemId;

  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contentItemId) {
      setLoading(false);
      return;
    }
    supabase
      .from("stories")
      .select("id,title,status,content_type,brand_profile_id,workspace_id,metadata,scripts,created_at,updated_at")
      .eq("id", contentItemId)
      .maybeSingle()
      .then(({ data }) => {
        setStory(data || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [contentItemId]);

  return <StudioWorkspace story={story} storyId={contentItemId} loading={loading} />;
}
