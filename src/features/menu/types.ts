export type Names = { hy: string; ru: string; en: string };

export type EditorCategory = { id: string; sort: number; prepAreaId: string | null; names: Names };
export type EditorDish = {
  id: string;
  categoryId: string;
  price: number;
  sort: number;
  prepAreaId: string | null;
  tags: string[];
  imagePath: string | null;
  names: Names;
  descriptions: Names;
  needsReview: boolean;
  modifierGroupIds: string[];
};
export type EditorOption = { id: string; names: Names; priceDelta: number; isDefault: boolean };
export type EditorGroup = { id: string; minSelect: number; maxSelect: number; names: Names; options: EditorOption[] };
export type PublishState = { published: boolean; hasChanges: boolean; publishedAt: string | null };

export type EditorData = {
  restaurantId: string;
  locationId: string;
  soldOut: string[];
  publish: PublishState;
  categories: EditorCategory[];
  dishes: EditorDish[];
  groups: EditorGroup[];
  prepAreas: { id: string; name: string }[];
};

export const emptyNames = (): Names => ({ hy: "", ru: "", en: "" });
