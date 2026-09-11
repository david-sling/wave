"use server";

export type CreateChannelState = {
  error?: string;
};

const TTL_VALUES = new Set(["1h", "24h", "7d"]);

/**
 * Create-channel form handler. Validates the fields the form sends and will
 * call the channel API once it exists (tracked in the channel create issue).
 * Until then it reports that creation is not switched on for this instance.
 */
export async function createChannel(
  _previous: CreateChannelState,
  formData: FormData,
): Promise<CreateChannelState> {
  const name = String(formData.get("name") ?? "").trim();
  const ttl = String(formData.get("ttl") ?? "");
  const maxParticipants = Number(formData.get("max_participants"));

  if (name.length > 60) {
    return { error: "Keep the channel name under 60 characters." };
  }
  if (!TTL_VALUES.has(ttl)) {
    return { error: "Choose how long the channel should live." };
  }
  if (
    !Number.isInteger(maxParticipants) ||
    maxParticipants < 2 ||
    maxParticipants > 50
  ) {
    return { error: "Participants must be a whole number from 2 to 50." };
  }

  return {
    error:
      "Creating channels is not switched on for this instance yet. The API is in progress.",
  };
}
