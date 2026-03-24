import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolCallResult } from "./ToolCallResult";

describe("ToolCallResult", () => {
  it("renders collapsed by default showing tool name", () => {
    render(
      <ToolCallResult toolName="weather__get_forecast" args={{}} result={{}} />
    );

    // Tool name visible (formatted without server prefix)
    expect(screen.getByText("get_forecast")).toBeInTheDocument();

    // Content not visible yet
    expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();
  });

  it("clicking header expands to show args and result JSON", () => {
    const args = { city: "London" };
    const result = { temp: 15 };

    render(
      <ToolCallResult toolName="weather__get_forecast" args={args} result={result} />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();

    // Check that the pre elements contain the JSON text
    const pres = document.querySelectorAll("pre");
    expect(pres.length).toBe(2);
    expect(pres[0].textContent).toContain('"city"');
    expect(pres[1].textContent).toContain('"temp"');
  });

  it("clicking again collapses", () => {
    render(
      <ToolCallResult toolName="srv__tool" args={{}} result={{}} />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button); // expand
    expect(screen.getByText("Arguments")).toBeInTheDocument();

    fireEvent.click(button); // collapse
    expect(screen.queryByText("Arguments")).not.toBeInTheDocument();
  });

  it("isError styling applied when isError=true", () => {
    const result = { error: "something failed" };

    render(
      <ToolCallResult toolName="srv__tool" args={{}} result={result} isError />
    );

    fireEvent.click(screen.getByRole("button"));

    // Find result container which has error class
    const errorDiv = document.querySelector(".error");
    expect(errorDiv).not.toBeNull();
  });

  it("no error class when isError is not set", () => {
    render(
      <ToolCallResult toolName="srv__tool" args={{}} result={{ ok: true }} />
    );

    fireEvent.click(screen.getByRole("button"));

    const errorDiv = document.querySelector(".error");
    expect(errorDiv).toBeNull();
  });

  it("displays namespaced tool name formatted correctly", () => {
    render(
      <ToolCallResult toolName="my_server__my_tool_name" args={{}} result={{}} />
    );
    // Should show only the tool part, not the server prefix
    expect(screen.getByText("my_tool_name")).toBeInTheDocument();
  });

  it("tool without namespace prefix displays full name", () => {
    render(
      <ToolCallResult toolName="standalone_tool" args={{}} result={{}} />
    );
    expect(screen.getByText("standalone_tool")).toBeInTheDocument();
  });
});
