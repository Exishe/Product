export type Names = { hy: string; ru: string; en: string };

export type EditorCategory = {
  id: string;
  sort: number;
  prepAreaId: string | null;
  names: Names;
  /** Shown to guests after the next Publish (ADR-068). */
  isActive: boolean;
  /** Daily hours in the café's time zone, "HH:MM" (ADR-068); null means all day. */
  window: { from: string; to: string } | null;
};
export type EditorDish = {
  id: string;
  categoryId: string;
  price: number;
  sort: number;
  prepAreaId: string | null;
  tags: string[];
  allergens: string[];
  /** The owner has reviewed the allergen information (ADR-083): with an empty list it means "none". */
  allergensConfirmed: boolean;
  imagePath: string | null;
  names: Names;
  descriptions: Names;
  needsReview: boolean;
  /** Off hides the dish from the guest menu after the next publish. */
  isActive: boolean;
  modifierGroupIds: string[];
};
export type EditorOption = { id: string; names: Names; priceDelta: number; isDefault: boolean };
export type EditorGroup = {
  id: string;
  minSelect: number;
  maxSelect: number;
  names: Names;
  options: EditorOption[];
};
export type PublishState = { published: boolean; hasChanges: boolean; publishedAt: string | null };

export type EditorData = {
  restaurantId: string;
  /** Only owners see and set cost prices (ADR-057). */
  isOwner: boolean;
  /** Cost price per dish id, owner only; empty for managers. */
  costs: Record<string, number>;
  locationId: string;
  soldOut: string[];
  publish: PublishState;
  categories: EditorCategory[];
  /** False until migration 20261123120000_availability_controls is applied: the hours fields stay hidden. */
  windowsSupported: boolean;
  /** The café's time zone, to tell whether a section is hidden right now. */
  timeZone: string;
  /** False until migration 20261123250000_ingredients_substitutes is applied: the ingredients panel stays hidden. */
  ingredientsSupported: boolean;
  /** False until migration 20261123320000_calories_tags is applied: no calorie fields in the ingredients panel. */
  kcalSupported: boolean;
  /** False until migration 20261123340000_allergen_review is applied: no "none of the allergens" control. */
  allergenReviewSupported: boolean;
  /** What a dish without a replacement does when a key ingredient is out (ADR-076). */
  outIngredientDisplay: "hide" | "sold_out";
  dishes: EditorDish[];
  groups: EditorGroup[];
  prepAreas: { id: string; name: string }[];
};

export const emptyNames = (): Names => ({ hy: "", ru: "", en: "" });
