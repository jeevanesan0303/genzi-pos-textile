import React from "react";

export default function CategoriesView({
  title,
  table,
  categoriesReady,
  categoriesLoading,
  categoryError,
  categoryBusy,
  refreshCategories
}) {
  return (
    <>
      {title(
        "Categories",
        "Organize your dress collections.",
        categoriesReady && !categoriesLoading && !categoryBusy
          ? "categories"
          : undefined
      )}

      <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
        <button
          type="button"
          className="secondary"
          onClick={refreshCategories}
          disabled={categoriesLoading || categoryBusy}
        >
          {categoriesLoading ? "Loading..." : "Refresh categories"}
        </button>

        {categoryBusy && (
          <p role="status">Waiting for the database confirmation...</p>
        )}

        {categoryError && (
          <p role="alert" style={{ color: "#dc2626" }}>
            {categoryError}
          </p>
        )}
      </div>

      {categoriesReady &&
        table("categories", [
          ["name", "Category"],
          ["description", "Description"]
        ])}
    </>
  );
}