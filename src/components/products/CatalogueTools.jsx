import React from "react";

export default function CatalogueTools({
  products,
  filters,
  setFilters,
  exportProducts
}) {
  const options = key =>
    [...new Set(
      products.map(product => product[key]).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

  return (
    <div className="panel catalogue-tools">
      <div>
        <strong>Find the right variant</strong>
        <small>Filter by size, colour and availability</small>
      </div>

      {["size", "colour", "stock"].map(key => (
        <label key={key}>
          {key === "stock" ? "Availability" : key}

          <select
            value={filters[key]}
            onChange={event => {
              setFilters(current => ({
                ...current,
                [key]: event.target.value
              }));
            }}
          >
            <option value="All">
              All {key === "stock" ? "stock" : key === "size" ? "sizes" : "colours"}
            </option>

            {(key === "stock"
              ? ["In stock", "Low stock", "Out of stock"]
              : options(key)
            ).map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="button"
        className="secondary"
        onClick={() => {
          setFilters({
            size: "All",
            colour: "All",
            stock: "All"
          });
        }}
      >
        Reset
      </button>

      <button
        type="button"
        className="secondary"
        onClick={exportProducts}
      >
        Export catalogue
      </button>
    </div>
  );
}