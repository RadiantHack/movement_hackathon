/**
 * A2A Message Action Handler
 * Registers the A2A communication visualizer action
 */

import React from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { MessageToA2A } from "../a2a/MessageToA2A";
import { MessageFromA2A } from "../a2a/MessageFromA2A";

/**
 * Register A2A message visualizer action
 */
export function useA2AAction() {
  useCopilotAction({
    name: "send_message_to_a2a_agent",
    description: "Sends a message to an A2A agent",
    available: "frontend",
    parameters: [
      {
        name: "agentName",
        type: "string",
        description: "The name of the A2A agent to send the message to",
      },
      {
        name: "task",
        type: "string",
        description: "The message to send to the A2A agent",
      },
    ],
    render: (props) => {
      if (
        !props.args?.agentName ||
        !props.args?.task ||
        props.args.agentName.trim() === "" ||
        props.args.task.trim() === ""
      ) {
        return <></>;
      }
      return (
        <>
          <MessageToA2A {...props} />
          <MessageFromA2A {...props} />
        </>
      );
    },
  });
}
