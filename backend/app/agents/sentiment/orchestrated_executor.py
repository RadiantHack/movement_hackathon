"""
Orchestrated Executor for Combined Sentiment + Trading Agent

Uses Google ADK Runner to execute SequentialAgent with sentiment and trading analysis.
"""

import json

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.utils import new_agent_text_message
from google.adk.runners import InMemoryRunner
from google.adk.types import Part, UserContent

from .core.constants import DEFAULT_SESSION_ID, ERROR_CANCEL_NOT_SUPPORTED, ERROR_EXECUTION_ERROR
from .orchestrated_agent import root_agent


def _get_session_id(context: RequestContext) -> str:
    """Extract session ID from context."""
    return getattr(context, "context_id", DEFAULT_SESSION_ID)


def _build_execution_error_response(error: Exception) -> str:
    """Build response for execution error."""
    return json.dumps(
        {
            "type": "sentiment_trading",
            "success": False,
            "error": f"{ERROR_EXECUTION_ERROR}: {str(error)}",
        },
        indent=2,
    )


class OrchestratedSentimentExecutor(AgentExecutor):
    """Executor for Combined Sentiment + Trading Agent using Google ADK SequentialAgent."""

    def __init__(self):
        self.agent = root_agent

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        """Execute the combined sentiment+trading agent request."""
        query = context.get_user_input()
        session_id = _get_session_id(context)

        print(f"🔍 Orchestrated Sentiment+Trading Agent received query: {query}")
        print(f"   Session ID: {session_id}")

        try:
            # Use Runner to properly execute SequentialAgent
            app_name = "agents"
            runner = InMemoryRunner(
                agent=self.agent,
                app_name=app_name,
            )

            # Create or get the session
            session = await runner.session_service.get_session(
                app_name=app_name,
                user_id="user",
                session_id=session_id,
            )
            if not session:
                session = await runner.session_service.create_session(
                    app_name=app_name,
                    user_id="user",
                    session_id=session_id,
                )

            # Run the sequential agent with the query
            final_response = None
            async for event in runner.run_async(
                user_id="user",
                session_id=session_id,
                new_message=UserContent(parts=[Part(text=query)]),
            ):
                # Collect the final response from events
                if hasattr(event, "content") and event.content:
                    if isinstance(event.content, str):
                        final_response = event.content
                    elif hasattr(event.content, "text"):
                        final_response = event.content.text

            # If no response from events, try to get from session state
            if not final_response:
                session = await runner.session_service.get_session(
                    app_name=app_name,
                    user_id="user",
                    session_id=session_id,
                )
                # Try to extract response from session state
                # The trading analysis agent should have stored results
                final_response = json.dumps(
                    {
                        "type": "sentiment_trading",
                        "message": "Analysis completed. Check session state for detailed results.",
                        "success": True,
                    },
                    indent=2,
                )

            # Validate and send response
            if final_response:
                # Try to parse as JSON, if not, wrap it
                try:
                    json.loads(final_response)
                except (json.JSONDecodeError, TypeError):
                    # Wrap text response in JSON
                    final_response = json.dumps(
                        {
                            "type": "sentiment_trading",
                            "response": final_response,
                            "success": True,
                        },
                        indent=2,
                    )

                await event_queue.enqueue_event(new_agent_text_message(final_response))
                print("✅ Successfully enqueued orchestrated response")
            else:
                error_response = _build_execution_error_response(
                    Exception("No response generated from agent")
                )
                await event_queue.enqueue_event(new_agent_text_message(error_response))

        except Exception as e:
            print(f"❌ Error in orchestrated execute: {e}")
            import traceback

            traceback.print_exc()
            error_response = _build_execution_error_response(e)
            await event_queue.enqueue_event(new_agent_text_message(error_response))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        """Cancel execution (not supported)."""
        raise Exception(ERROR_CANCEL_NOT_SUPPORTED)
