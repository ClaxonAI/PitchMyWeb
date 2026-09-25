import { describe, expect, it, vi } from "vitest";
import { OverpassQueryError, OverpassSource } from "./overpass";
import { NominatimClient } from "./nominatim";

function fakeNominatim(bbox = { south: 12.9, north: 13.2, west: 80.1, east: 80.3 }) {
  return new NominatimClient({
    apiUrl: "https://nominatim.example",
    userAgent: "Test/1.0",
    fetchImpl: vi.fn(async () => new Response(JSON.stringify([{ boundingbox: [String(bbox.south), String(bbox.north), String(bbox.west), String(bbox.east)] }]), { status: 200 })),
  });
}

const baseQuery = { location: "Chennai", category: "Dental Clinic", radius: null, minRating: null, minReviews: null, leadLimit: 20 };

describe("OverpassSource.search", () => {
  it("returns [] without calling Overpass when the category has no OSM tag mapping", async () => {
    const fetchImpl = vi.fn();
    const source = new OverpassSource({ apiUrl: "https://overpass.example", userAgent: "Test/1.0", fetchImpl, nominatim: fakeNominatim() });
    const result = await source.search({ ...baseQuery, category: "Aerospace Consulting" });
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("geocodes the location, queries Overpass with the resolved bbox, and maps named elements", async () => {
    const overpassResponse = {
      elements: [
        {
          type: "node",
          id: 111,
          lat: 13.05,
          lon: 80.25,
          tags: { name: "Lakshmi Dental Care", phone: "+919800000001", "addr:housenumber": "12", "addr:street": "MG Road", "addr:city": "Chennai" },
        },
        // No `name` tag — must be silently skipped, not returned as a nameless "business".
        { type: "node", id: 222, lat: 13.06, lon: 80.26, tags: { amenity: "dentist" } },
        {
          type: "way",
          id: 333,
          center: { lat: 13.07, lon: 80.27 },
          tags: { name: "Sree Dental", phone: "+919800000002" },
        },
      ],
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://overpass.example");
      expect(init?.method).toBe("POST");
      const decodedBody = decodeURIComponent(String(init?.body).replace(/^data=/, ""));
      expect(decodedBody).toContain(`["amenity"="dentist"]`);
      expect(decodedBody).toContain("12.9,80.1,13.2,80.3"); // bbox in Overpass order: south,west,north,east
      return new Response(JSON.stringify(overpassResponse), { status: 200 });
    });

    const source = new OverpassSource({ apiUrl: "https://overpass.example", userAgent: "Test/1.0", fetchImpl, nominatim: fakeNominatim() });
    const result = await source.search(baseQuery);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "Lakshmi Dental Care",
      category: "Dental Clinic",
      address: "12 MG Road",
      city: "Chennai",
      phone: "+919800000001",
      website: null,
      latitude: 13.05,
      longitude: 80.25,
      source: "osm",
      externalId: "node/111",
    });
    // No addr:city tag on this element — must fall back to the campaign's
    // own requested location, not be left null (confirmed live against the
    // real Overpass API: most real POIs lack addr:city even when correctly
    // returned by the bbox query, which used to make every result fail
    // apps/api's location text-match filter).
    expect(result[1]).toMatchObject({ name: "Sree Dental", city: "Chennai", latitude: 13.07, longitude: 80.27, externalId: "way/333" });
  });

  it("throws a retryable OverpassQueryError on a 429/504 (overloaded) response", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 429 }));
    const source = new OverpassSource({ apiUrl: "https://overpass.example", userAgent: "Test/1.0", fetchImpl, nominatim: fakeNominatim() });
    await expect(source.search(baseQuery)).rejects.toThrow(OverpassQueryError);
    await expect(source.search(baseQuery)).rejects.toMatchObject({ retryable: true });
  });

  it("throws a non-retryable OverpassQueryError on a 400 (malformed query) response", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad query", { status: 400 }));
    const source = new OverpassSource({ apiUrl: "https://overpass.example", userAgent: "Test/1.0", fetchImpl, nominatim: fakeNominatim() });
    await expect(source.search(baseQuery)).rejects.toMatchObject({ retryable: false });
  });

  it("throws a retryable OverpassQueryError on a connection failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const source = new OverpassSource({ apiUrl: "https://overpass.example", userAgent: "Test/1.0", fetchImpl, nominatim: fakeNominatim() });
    await expect(source.search(baseQuery)).rejects.toThrow(OverpassQueryError);
    await expect(source.search(baseQuery)).rejects.toMatchObject({ retryable: true });
  });
});
