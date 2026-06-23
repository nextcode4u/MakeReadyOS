import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPropertyWikiEntry,
  createPropertyWikiVendor,
  deletePropertyWikiAsset,
  getPropertyWikiAssets,
  getPropertyWikiEntries,
  getPropertyWikiOverview,
  getPropertyWikiRecord,
  getPropertyWikiVendors,
  propertyWikiAssetDownloadUrl,
  savePropertyWikiProfile,
  searchPropertyWiki,
  togglePropertyWikiFavorite,
  updatePropertyWikiAsset,
  updatePropertyWikiEntry,
  updatePropertyWikiVendor,
  uploadPropertyWikiAsset,
  type Property,
  type PropertyWikiAsset,
  type PropertyWikiAssetKind,
  type PropertyWikiEntry,
  type PropertyWikiRecordSummary,
  type PropertyWikiSection,
  type PropertyWikiTargetType,
  type PropertyWikiVendor,
  type UserLanguage,
  type UserRole,
} from "../lib/api";
import type { OpenWikiRecordRequest } from "../lib/wikiNavigation";
import { t, tWithVars } from "../lib/i18n";
import { StatusState } from "./StatusState";

type Props = {
  properties: Property[];
  selectedPropertyId?: string;
  userRole: UserRole;
  language?: UserLanguage;
  openRecordRequest?: (OpenWikiRecordRequest & { nonce: number }) | null;
};

type WikiTab =
  | "overview"
  | "utilities"
  | "access"
  | "pools"
  | "equipment"
  | "standards"
  | "contacts"
  | "sops"
  | "issues"
  | "vendors"
  | "documents"
  | "photos"
  | "emergency"
  | "emergencyMode"
  | "pages"
  | "search";

type EntryDraft = {
  section: PropertyWikiSection;
  title: string;
  category: string;
  building: string;
  locationDescription: string;
  equipmentModel: string;
  manufacturer: string;
  serialNumber: string;
  installDate: string;
  warrantyExpiresAt: string;
  floorPlan: string;
  unitType: string;
  blindSizes: string;
  hvacNotes: string;
  waterHeaterNotes: string;
  applianceNotes: string;
  paintStandards: string;
  countertopNotes: string;
  cabinetNotes: string;
  flooringNotes: string;
  contactType: string;
  contactTitle: string;
  phone: string;
  email: string;
  isEmergencyContact: boolean;
  relatedEntryIds: string[];
  relatedVendorIds: string[];
  notes: string;
  content: string;
  issueStatus: "Active" | "Resolved" | "Archived";
  tags: string;
  contacts: string;
  situation: string;
  poolCapacity: string;
  spaCapacity: string;
  pumpModels: string;
  filterModels: string;
  filterSizes: string;
  heaterModels: string;
  controllerNotes: string;
  chemicalTargetNotes: string;
  isPinned: boolean;
  isEmergency: boolean;
  isActive: boolean;
};

type VendorDraft = {
  vendorType: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  emergencyPhone: string;
  notes: string;
  isActive: boolean;
};

type DetailTarget = {
  targetType: PropertyWikiTargetType;
  id: string;
};

const tabToSection: Partial<Record<WikiTab, PropertyWikiSection>> = {
  utilities: "UTILITIES",
  access: "ACCESS_CONTROL",
  pools: "POOLS",
  equipment: "EQUIPMENT_REGISTRY",
  standards: "UNIT_STANDARDS",
  contacts: "PROPERTY_CONTACTS",
  sops: "SOP_LIBRARY",
  issues: "KNOWN_ISSUES",
  emergency: "EMERGENCY_PROCEDURES",
  pages: "CUSTOM_PAGES",
};

function roleAccess(role: UserRole) {
  if (role === "ADMIN") return { view: true, edit: true, canPin: true, canEmergency: true };
  if (role === "MANAGER") return { view: true, edit: true, canPin: true, canEmergency: true };
  if (role === "TECH") return { view: true, edit: true, canPin: false, canEmergency: false };
  return { view: true, edit: false, canPin: false, canEmergency: false };
}

function emptyEntryDraft(section: PropertyWikiSection): EntryDraft {
  return {
    section,
    title: "",
    category: "",
    building: "",
    locationDescription: "",
    equipmentModel: "",
    manufacturer: "",
    serialNumber: "",
    installDate: "",
    warrantyExpiresAt: "",
    floorPlan: "",
    unitType: "",
    blindSizes: "",
    hvacNotes: "",
    waterHeaterNotes: "",
    applianceNotes: "",
    paintStandards: "",
    countertopNotes: "",
    cabinetNotes: "",
    flooringNotes: "",
    contactType: "",
    contactTitle: "",
    phone: "",
    email: "",
    isEmergencyContact: false,
    relatedEntryIds: [],
    relatedVendorIds: [],
    notes: "",
    content: "",
    issueStatus: "Active",
    tags: "",
    contacts: "",
    situation: "",
    poolCapacity: "",
    spaCapacity: "",
    pumpModels: "",
    filterModels: "",
    filterSizes: "",
    heaterModels: "",
    controllerNotes: "",
    chemicalTargetNotes: "",
    isPinned: false,
    isEmergency: false,
    isActive: true,
  };
}

function emptyVendorDraft(): VendorDraft {
  return {
    vendorType: "Pool",
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    emergencyPhone: "",
    notes: "",
    isActive: true,
  };
}

function mapVendorToDraft(vendor: PropertyWikiVendor): VendorDraft {
  return {
    vendorType: vendor.vendorType,
    companyName: vendor.companyName,
    contactName: vendor.contactName ?? "",
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    emergencyPhone: vendor.emergencyPhone ?? "",
    notes: vendor.notes ?? "",
    isActive: vendor.isActive,
  };
}

function sectionLabel(section: string, language: UserLanguage) {
  switch (section as PropertyWikiSection) {
    case "UTILITIES": return t(language, "wiki.utilities");
    case "ACCESS_CONTROL": return t(language, "wiki.access");
    case "POOLS": return t(language, "wiki.pools");
    case "EMERGENCY_PROCEDURES": return t(language, "wiki.procedures");
    case "CUSTOM_PAGES": return t(language, "wiki.pages");
    case "EQUIPMENT_REGISTRY": return t(language, "wiki.equipment");
    case "UNIT_STANDARDS": return t(language, "wiki.standards");
    case "PROPERTY_CONTACTS": return t(language, "wiki.contacts");
    case "SOP_LIBRARY": return t(language, "wiki.sops");
    case "KNOWN_ISSUES": return t(language, "wiki.knownIssues");
    default:
      return section.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function recordSummary(entry: PropertyWikiEntry) {
  return [
    entry.notes,
    entry.content,
    entry.locationDescription,
    entry.building,
    entry.filterSizes,
    entry.blindSizes,
    entry.paintStandards,
    entry.phone,
    entry.email,
  ].find((value) => value && value.trim()) ?? "";
}

function mapEntryToDraft(entry: PropertyWikiEntry): EntryDraft {
  return {
    section: entry.section,
    title: entry.title,
    category: entry.category ?? "",
    building: entry.building ?? "",
    locationDescription: entry.locationDescription ?? "",
    equipmentModel: entry.equipmentModel ?? "",
    manufacturer: entry.manufacturer ?? "",
    serialNumber: entry.serialNumber ?? "",
    installDate: formatDateInput(entry.installDate),
    warrantyExpiresAt: formatDateInput(entry.warrantyExpiresAt),
    floorPlan: entry.floorPlan ?? "",
    unitType: entry.unitType ?? "",
    blindSizes: entry.blindSizes ?? "",
    hvacNotes: entry.hvacNotes ?? "",
    waterHeaterNotes: entry.waterHeaterNotes ?? "",
    applianceNotes: entry.applianceNotes ?? "",
    paintStandards: entry.paintStandards ?? "",
    countertopNotes: entry.countertopNotes ?? "",
    cabinetNotes: entry.cabinetNotes ?? "",
    flooringNotes: entry.flooringNotes ?? "",
    contactType: entry.contactType ?? "",
    contactTitle: entry.contactTitle ?? "",
    phone: entry.phone ?? "",
    email: entry.email ?? "",
    isEmergencyContact: entry.isEmergencyContact,
    relatedEntryIds: entry.relatedEntryIds,
    relatedVendorIds: entry.relatedVendorIds,
    notes: entry.notes ?? "",
    content: entry.content ?? "",
    issueStatus: entry.issueStatus ?? "Active",
    tags: entry.tags.join(", "),
    contacts: entry.contacts ?? "",
    situation: entry.situation ?? "",
    poolCapacity: entry.poolCapacity ?? "",
    spaCapacity: entry.spaCapacity ?? "",
    pumpModels: entry.pumpModels ?? "",
    filterModels: entry.filterModels ?? "",
    filterSizes: entry.filterSizes ?? "",
    heaterModels: entry.heaterModels ?? "",
    controllerNotes: entry.controllerNotes ?? "",
    chemicalTargetNotes: entry.chemicalTargetNotes ?? "",
    isPinned: entry.isPinned,
    isEmergency: entry.isEmergency,
    isActive: entry.isActive,
  };
}

function selectedValues(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

function canFavoriteRecord(section: string, targetType: PropertyWikiTargetType) {
  if (targetType === "VENDOR" || targetType === "ASSET") return true;
  return ["UTILITIES", "EQUIPMENT_REGISTRY", "SOP_LIBRARY", "KNOWN_ISSUES", "CUSTOM_PAGES"].includes(section);
}

function DetailLinks({ record, onOpen, language }: { record: PropertyWikiRecordSummary[]; onOpen: (targetType: PropertyWikiTargetType, id: string) => void; language: UserLanguage }) {
  if (!record.length) return <p className="muted">{t(language, "wiki.noRelatedContent")}</p>;
  return (
    <div className="property-wiki-related-list">
      {record.map((item) => (
        <button key={`${item.targetType}-${item.id}`} type="button" className="property-wiki-related-item" onClick={() => onOpen(item.targetType, item.id)}>
          <strong>{item.title}</strong>
          <span>{sectionLabel(item.section, language)}{item.building ? ` / ${item.building}` : ""}</span>
        </button>
      ))}
    </div>
  );
}

export function PropertyWikiPanel({ properties, selectedPropertyId, userRole, language = "en", openRecordRequest }: Props) {
  const access = roleAccess(userRole);
  const isSpanish = language === "es";
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = useState(selectedPropertyId || properties[0]?.id || "");
  const [activeTab, setActiveTab] = useState<WikiTab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<DetailTarget | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    address: "",
    unitCount: "",
    buildingCount: "",
    officePhone: "",
    afterHoursPhone: "",
    propertyManager: "",
    maintenanceSupervisor: "",
    regionalManager: "",
    generalNotes: "",
  });
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(() => emptyEntryDraft("UTILITIES"));
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [vendorDraft, setVendorDraft] = useState<VendorDraft>(() => emptyVendorDraft());
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState({
    kind: "DOCUMENT" as PropertyWikiAssetKind,
    title: "",
    category: "",
    building: "",
    description: "",
    tags: "",
    isEmergency: false,
    entryId: "",
    vendorId: "",
  });

  useEffect(() => {
    if (selectedPropertyId && properties.some((property) => property.id === selectedPropertyId)) {
      setPropertyId(selectedPropertyId);
      return;
    }
    if (!propertyId && properties[0]?.id) {
      setPropertyId(properties[0].id);
    }
  }, [properties, propertyId, selectedPropertyId]);

  useEffect(() => {
    if (!openRecordRequest) return;
    if (openRecordRequest.propertyId) {
      setPropertyId(openRecordRequest.propertyId);
    }
    setSelectedRecord({ targetType: openRecordRequest.targetType, id: openRecordRequest.id });
  }, [openRecordRequest]);

  const section = tabToSection[activeTab];

  const overviewQuery = useQuery({
    queryKey: ["property-wiki", "overview", propertyId],
    queryFn: () => getPropertyWikiOverview(propertyId),
    enabled: Boolean(propertyId),
  });

  const allEntriesQuery = useQuery({
    queryKey: ["property-wiki", "entries", propertyId, "all"],
    queryFn: () => getPropertyWikiEntries({ propertyId, includeInactive: true }),
    enabled: Boolean(propertyId),
  });

  const entriesQuery = useQuery({
    queryKey: ["property-wiki", "entries", propertyId, section, activeTab === "contacts", sectionFilter],
    queryFn: () => getPropertyWikiEntries({
      propertyId,
      section,
      includeInactive: activeTab === "contacts" || activeTab === "issues",
      q: sectionFilter.trim() || undefined,
    }),
    enabled: Boolean(propertyId && section),
  });

  const vendorsQuery = useQuery({
    queryKey: ["property-wiki", "vendors", propertyId],
    queryFn: () => getPropertyWikiVendors({ propertyId, includeInactive: true }),
    enabled: Boolean(propertyId),
  });

  const documentsQuery = useQuery({
    queryKey: ["property-wiki", "assets", propertyId, "DOCUMENT"],
    queryFn: () => getPropertyWikiAssets({ propertyId, kind: "DOCUMENT", includeInactive: true }),
    enabled: Boolean(propertyId),
  });

  const photosQuery = useQuery({
    queryKey: ["property-wiki", "assets", propertyId, "PHOTO"],
    queryFn: () => getPropertyWikiAssets({ propertyId, kind: "PHOTO", includeInactive: true }),
    enabled: Boolean(propertyId),
  });

  const searchQueryResult = useQuery({
    queryKey: ["property-wiki", "search", propertyId, searchQuery],
    queryFn: () => searchPropertyWiki({ propertyId, q: searchQuery }),
    enabled: Boolean(propertyId && activeTab === "search" && searchQuery.trim().length > 1),
  });

  const detailQuery = useQuery({
    queryKey: ["property-wiki", "record", selectedRecord?.targetType, selectedRecord?.id],
    queryFn: () => getPropertyWikiRecord(selectedRecord!.targetType, selectedRecord!.id),
    enabled: Boolean(selectedRecord),
  });

  useEffect(() => {
    const profile = overviewQuery.data?.profile;
    if (!profile) return;
    setProfileDraft({
      address: profile.address ?? "",
      unitCount: profile.unitCount === null || profile.unitCount === undefined ? "" : String(profile.unitCount),
      buildingCount: profile.buildingCount === null || profile.buildingCount === undefined ? "" : String(profile.buildingCount),
      officePhone: profile.officePhone ?? "",
      afterHoursPhone: profile.afterHoursPhone ?? "",
      propertyManager: profile.propertyManager ?? "",
      maintenanceSupervisor: profile.maintenanceSupervisor ?? "",
      regionalManager: profile.regionalManager ?? "",
      generalNotes: profile.generalNotes ?? "",
    });
  }, [overviewQuery.data?.profile]);

  useEffect(() => {
    if (section) {
      setEntryDraft(emptyEntryDraft(section));
      setEditingEntryId(null);
      setSectionFilter("");
    }
  }, [section]);

  const allEntries = allEntriesQuery.data?.entries ?? [];
  const wikiVendors = vendorsQuery.data?.vendors ?? [];
  const activeEntries = useMemo(() => (entriesQuery.data?.entries ?? []).filter((entry) => entry.isActive), [entriesQuery.data?.entries]);
  const wikiAssets = activeTab === "photos" ? (photosQuery.data?.assets ?? []) : (documentsQuery.data?.assets ?? []);
  const activeWikiAssets = useMemo(() => wikiAssets.filter((asset) => asset.isActive), [wikiAssets]);
  const archivedWikiAssets = useMemo(() => wikiAssets.filter((asset) => !asset.isActive), [wikiAssets]);
  const normalizedSectionFilter = sectionFilter.trim().toLowerCase();
  const archivedEntries = useMemo(() => {
    if (!section) return [];
    return allEntries.filter((entry) => {
      if (entry.section !== section || entry.isActive) return false;
      if (!normalizedSectionFilter) return true;
      return [
        entry.title,
        entry.category,
        entry.contactType,
        entry.building,
        entry.locationDescription,
        entry.manufacturer,
        entry.equipmentModel,
        entry.serialNumber,
        entry.notes,
        entry.content,
        Array.isArray(entry.tags) ? entry.tags.join(" ") : entry.tags,
      ].some((value) => value?.toLowerCase().includes(normalizedSectionFilter));
    });
  }, [allEntries, normalizedSectionFilter, section]);
  const activeWikiVendors = useMemo(() => wikiVendors.filter((vendor) => vendor.isActive), [wikiVendors]);
  const archivedWikiVendors = useMemo(() => wikiVendors.filter((vendor) => !vendor.isActive), [wikiVendors]);

  const currentCategories = useMemo(() => {
    const categories = overviewQuery.data?.categories;
    if (!categories) return [];
    if (activeTab === "utilities") return categories.utility;
    if (activeTab === "access") return categories.accessControl;
    if (activeTab === "equipment") return categories.equipment;
    if (activeTab === "contacts") return categories.propertyContacts;
    if (activeTab === "sops") return categories.sop;
    if (activeTab === "vendors") return categories.vendorTypes;
    if (activeTab === "documents") return categories.document;
    if (activeTab === "photos") return categories.photo;
    return [];
  }, [activeTab, overviewQuery.data?.categories]);

  const contactOptions = useMemo(() => allEntries.filter((entry) => entry.section === "PROPERTY_CONTACTS"), [allEntries]);
  const equipmentOptions = useMemo(() => allEntries.filter((entry) => entry.section === "EQUIPMENT_REGISTRY"), [allEntries]);

  const propertyWikiInvalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["property-wiki"] });
  };

  const saveProfileMutation = useMutation({
    mutationFn: savePropertyWikiProfile,
    onSuccess: () => void propertyWikiInvalidate(),
  });

  const saveEntryMutation = useMutation({
    mutationFn: async (draft: EntryDraft) => {
      const payload = {
        propertyId,
        ...draft,
        category: draft.category || null,
        building: draft.building || null,
        locationDescription: draft.locationDescription || null,
        equipmentModel: draft.equipmentModel || null,
        manufacturer: draft.manufacturer || null,
        serialNumber: draft.serialNumber || null,
        installDate: draft.installDate || null,
        warrantyExpiresAt: draft.warrantyExpiresAt || null,
        floorPlan: draft.floorPlan || null,
        unitType: draft.unitType || null,
        blindSizes: draft.blindSizes || null,
        hvacNotes: draft.hvacNotes || null,
        waterHeaterNotes: draft.waterHeaterNotes || null,
        applianceNotes: draft.applianceNotes || null,
        paintStandards: draft.paintStandards || null,
        countertopNotes: draft.countertopNotes || null,
        cabinetNotes: draft.cabinetNotes || null,
        flooringNotes: draft.flooringNotes || null,
        contactType: draft.contactType || null,
        contactTitle: draft.contactTitle || null,
        phone: draft.phone || null,
        email: draft.email || null,
        relatedEntryIds: draft.relatedEntryIds,
        relatedVendorIds: draft.relatedVendorIds,
        notes: draft.notes || null,
        content: draft.content || null,
        issueStatus: draft.section === "KNOWN_ISSUES" ? draft.issueStatus : null,
        tags: draft.tags,
        contacts: draft.contacts || null,
        situation: draft.situation || null,
        poolCapacity: draft.poolCapacity || null,
        spaCapacity: draft.spaCapacity || null,
        pumpModels: draft.pumpModels || null,
        filterModels: draft.filterModels || null,
        filterSizes: draft.filterSizes || null,
        heaterModels: draft.heaterModels || null,
        controllerNotes: draft.controllerNotes || null,
        chemicalTargetNotes: draft.chemicalTargetNotes || null,
        isPinned: draft.isPinned,
        isEmergency: draft.isEmergency,
        isEmergencyContact: draft.isEmergencyContact,
        isActive: draft.isActive,
      };
      if (editingEntryId) return updatePropertyWikiEntry(editingEntryId, payload);
      return createPropertyWikiEntry(payload);
    },
    onSuccess: () => {
      setEntryDraft(emptyEntryDraft(section ?? "UTILITIES"));
      setEditingEntryId(null);
      void propertyWikiInvalidate();
    },
  });

  const saveVendorMutation = useMutation({
    mutationFn: async (draft: VendorDraft) => {
      const payload = {
        propertyId,
        vendorType: draft.vendorType,
        companyName: draft.companyName,
        contactName: draft.contactName || null,
        phone: draft.phone || null,
        email: draft.email || null,
        emergencyPhone: draft.emergencyPhone || null,
        notes: draft.notes || null,
        isActive: draft.isActive,
      };
      if (editingVendorId) return updatePropertyWikiVendor(editingVendorId, payload);
      return createPropertyWikiVendor(payload);
    },
    onSuccess: () => {
      setVendorDraft(emptyVendorDraft());
      setEditingVendorId(null);
      void propertyWikiInvalidate();
    },
  });

  const uploadAssetMutation = useMutation({
    mutationFn: uploadPropertyWikiAsset,
    onSuccess: () => {
      setAssetDraft((current) => ({
        ...current,
        title: "",
        category: "",
        building: "",
        description: "",
        tags: "",
        entryId: "",
        vendorId: "",
      }));
      void propertyWikiInvalidate();
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: deletePropertyWikiAsset,
    onSuccess: () => void propertyWikiInvalidate(),
  });

  const favoriteMutation = useMutation({
    mutationFn: togglePropertyWikiFavorite,
    onSuccess: () => void propertyWikiInvalidate(),
  });

  const openQuickAdd = (tab: WikiTab, kind?: PropertyWikiAssetKind) => {
    setActiveTab(tab);
    if (kind) {
      setAssetDraft((current) => ({ ...current, kind }));
    }
  };

  const openRecord = (targetType: PropertyWikiTargetType, id: string) => {
    setSelectedRecord({ targetType, id });
  };

  const toggleFavorite = (targetType: PropertyWikiTargetType, id: string) => {
    void favoriteMutation.mutate({ targetType, targetId: id });
  };

  const loadEntryForEdit = (entry: PropertyWikiEntry) => {
    setEditingEntryId(entry.id);
    setEntryDraft(mapEntryToDraft(entry));
  };

  const setEntryActiveState = (entry: PropertyWikiEntry, isActive: boolean) => {
    void updatePropertyWikiEntry(entry.id, {
      propertyId,
      ...mapEntryToDraft(entry),
      category: entry.category,
      building: entry.building,
      locationDescription: entry.locationDescription,
      equipmentModel: entry.equipmentModel,
      manufacturer: entry.manufacturer,
      serialNumber: entry.serialNumber,
      installDate: entry.installDate,
      warrantyExpiresAt: entry.warrantyExpiresAt,
      floorPlan: entry.floorPlan,
      unitType: entry.unitType,
      blindSizes: entry.blindSizes,
      hvacNotes: entry.hvacNotes,
      waterHeaterNotes: entry.waterHeaterNotes,
      applianceNotes: entry.applianceNotes,
      paintStandards: entry.paintStandards,
      countertopNotes: entry.countertopNotes,
      cabinetNotes: entry.cabinetNotes,
      flooringNotes: entry.flooringNotes,
      contactType: entry.contactType,
      contactTitle: entry.contactTitle,
      phone: entry.phone,
      email: entry.email,
      relatedEntryIds: entry.relatedEntryIds,
      relatedVendorIds: entry.relatedVendorIds,
      notes: entry.notes,
      content: entry.content,
      issueStatus: entry.issueStatus,
      tags: entry.tags.join(", "),
      contacts: entry.contacts,
      situation: entry.situation,
      poolCapacity: entry.poolCapacity,
      spaCapacity: entry.spaCapacity,
      pumpModels: entry.pumpModels,
      filterModels: entry.filterModels,
      filterSizes: entry.filterSizes,
      heaterModels: entry.heaterModels,
      controllerNotes: entry.controllerNotes,
      chemicalTargetNotes: entry.chemicalTargetNotes,
      isPinned: entry.isPinned,
      isEmergency: entry.isEmergency,
      isEmergencyContact: entry.isEmergencyContact,
      isActive,
    }).then(() => propertyWikiInvalidate());
  };

  const setVendorActiveState = (vendor: PropertyWikiVendor, isActive: boolean) => {
    void updatePropertyWikiVendor(vendor.id, {
      propertyId,
      ...mapVendorToDraft(vendor),
      isActive,
    }).then(() => propertyWikiInvalidate());
  };

  const setAssetActiveState = (asset: PropertyWikiAsset, isActive: boolean) => {
    void updatePropertyWikiAsset(asset.id, {
      title: asset.title,
      category: asset.category,
      building: asset.building,
      description: asset.description,
      tags: asset.tags,
      isEmergency: asset.isEmergency,
      isActive,
    }).then(() => propertyWikiInvalidate());
  };

  const duplicateStandard = (entry: PropertyWikiEntry) => {
    setEditingEntryId(null);
    setEntryDraft({ ...mapEntryToDraft(entry), title: `${entry.title} Copy`, isPinned: false, isEmergency: false });
  };

  const renderTags = (tags: string[]) => {
    if (!tags.length) return null;
    return (
      <div className="pool-reading-stack">
        {tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    );
  };

  const renderSummaryRow = (summary: PropertyWikiRecordSummary, compact = false) => (
    <article key={`${summary.targetType}-${summary.id}`} className={`property-wiki-record${summary.isEmergency ? " emergency" : ""}${compact ? " compact" : ""}`}>
      <div>
        <strong>{summary.title}</strong>
        <span>{sectionLabel(summary.section, language)}{summary.building ? ` / ${summary.building}` : ""}{summary.property?.code ? ` / ${summary.property.code}` : ""}</span>
        <p>{summary.snippet || t(language, "wiki.noPreviewAvailable")}</p>
        {renderTags(summary.tags)}
      </div>
      <div className="pool-entry-actions">
        {canFavoriteRecord(summary.section, summary.targetType) ? <button type="button" className="button button-secondary" onClick={() => toggleFavorite(summary.targetType, summary.id)}>{summary.isFavorite ? t(language, "wiki.unfavorite") : t(language, "wiki.favorite")}</button> : null}
        <button type="button" className="button button-secondary" onClick={() => openRecord(summary.targetType, summary.id)}>{t(language, "wiki.view")}</button>
      </div>
    </article>
  );

  if (!access.view) {
    return <StatusState title={t(language, "wiki.unavailableTitle")} description={t(language, "wiki.unavailableCopy")} tone="error" />;
  }

  if (!properties.length) {
    return <StatusState title={t(language, "wiki.noPropertiesTitle")} description={t(language, "wiki.noPropertiesCopy")} />;
  }

  return (
    <section className="property-wiki-panel module-panel" data-testid="property-wiki-panel">
      <div className="module-heading">
        <div>
          <p className="eyebrow">{t(language, "wiki.title")}</p>
          <h1>{t(language, "wiki.title")}</h1>
          <p>{t(language, "wiki.copy")}</p>
        </div>
        <div className="module-actions">
          <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label={t(language, "wiki.property")}>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.code} - {property.name}</option>)}
          </select>
          <input
            data-testid="property-wiki-search-input"
            placeholder={t(language, "wiki.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setActiveTab("search");
              }
            }}
          />
          <button data-testid="property-wiki-search-submit" type="button" className="button button-secondary" onClick={() => setActiveTab("search")}>{t(language, "nav.search")}</button>
          <button data-testid="property-wiki-emergency-mode" type="button" className="button button-primary" onClick={() => setActiveTab("emergencyMode")}>{t(language, "wiki.emergencyMode")}</button>
        </div>
      </div>

      <div className="module-tabs">
        {([
          ["overview", t(language, "dashboard.overview")],
          ["utilities", t(language, "wiki.utilities")],
          ["access", t(language, "wiki.access")],
          ["pools", t(language, "wiki.pools")],
          ["equipment", t(language, "wiki.equipment")],
          ["standards", t(language, "wiki.standards")],
          ["contacts", t(language, "wiki.contacts")],
          ["sops", t(language, "wiki.sops")],
          ["issues", t(language, "wiki.knownIssues")],
          ["vendors", t(language, "nav.vendors")],
          ["documents", t(language, "wiki.documents")],
          ["photos", t(language, "wiki.photos")],
          ["emergency", t(language, "wiki.procedures")],
          ["emergencyMode", t(language, "wiki.emergencyMode")],
          ["pages", t(language, "wiki.pages")],
          ["search", t(language, "nav.search")],
        ] as Array<[WikiTab, string]>).map(([tab, label]) => (
          <button key={tab} type="button" className={activeTab === tab ? "active" : undefined} onClick={() => setActiveTab(tab)}>
            {label}
          </button>
        ))}
      </div>

      {detailQuery.data?.record ? (
        <div className="pool-card property-wiki-detail-panel">
          <div className="property-wiki-detail-header">
            <div>
              <h2>{detailQuery.data.record.title}</h2>
              <p>{sectionLabel(detailQuery.data.record.section, language)}{detailQuery.data.record.building ? ` / ${detailQuery.data.record.building}` : ""}</p>
            </div>
            <div className="pool-entry-actions">
              {canFavoriteRecord(detailQuery.data.record.section, detailQuery.data.record.targetType) ? <button type="button" className="button button-secondary" onClick={() => toggleFavorite(detailQuery.data.record!.targetType, detailQuery.data.record!.id)}>{detailQuery.data.record.isFavorite ? t(language, "wiki.unfavorite") : t(language, "wiki.favorite")}</button> : null}
              <button type="button" className="button button-secondary" onClick={() => setSelectedRecord(null)}>{t(language, "wiki.close")}</button>
            </div>
          </div>
          <div className="property-wiki-grid">
            <div className="pool-card property-wiki-summary">
              <h2>{t(language, "wiki.details")}</h2>
              {detailQuery.data.entry ? <>
                {detailQuery.data.entry.building ? <p><strong>{t(language, "wiki.buildingLabel")}</strong> {detailQuery.data.entry.building}</p> : null}
                {detailQuery.data.entry.notes ? <p>{detailQuery.data.entry.notes}</p> : null}
                {detailQuery.data.entry.content ? <p>{detailQuery.data.entry.content}</p> : null}
                {detailQuery.data.entry.issueStatus ? <p><strong>{t(language, "wiki.statusLabel")}</strong> {detailQuery.data.entry.issueStatus}</p> : null}
                {renderTags(detailQuery.data.entry.tags)}
              </> : null}
              {detailQuery.data.vendor ? <>
                <p>{detailQuery.data.vendor.notes || t(language, "wiki.noVendorNotesYet")}</p>
                <p>{detailQuery.data.vendor.phone || detailQuery.data.vendor.email || detailQuery.data.vendor.emergencyPhone || t(language, "wiki.noContactDetailsYet")}</p>
              </> : null}
              {detailQuery.data.asset ? <>
                {detailQuery.data.asset.building ? <p><strong>{t(language, "wiki.buildingLabel")}</strong> {detailQuery.data.asset.building}</p> : null}
                <p>{detailQuery.data.asset.description || detailQuery.data.asset.originalName}</p>
                <a className="button button-secondary" href={propertyWikiAssetDownloadUrl(detailQuery.data.asset.id)} target="_blank" rel="noreferrer">{t(language, "wiki.openFile")}</a>
              </> : null}
            </div>
            <div className="pool-card property-wiki-summary">
              <h2>{t(language, "wiki.relatedSops")}</h2>
              <DetailLinks record={detailQuery.data.related.sops} onOpen={openRecord} language={language} />
              <h2>{t(language, "wiki.relatedEquipment")}</h2>
              <DetailLinks record={detailQuery.data.related.equipment} onOpen={openRecord} language={language} />
              <h2>{t(language, "wiki.relatedKnownIssues")}</h2>
              <DetailLinks record={detailQuery.data.related.knownIssues} onOpen={openRecord} language={language} />
            </div>
            <div className="pool-card property-wiki-summary">
              <h2>{t(language, "wiki.relatedVendors")}</h2>
              <DetailLinks record={detailQuery.data.related.vendors} onOpen={openRecord} language={language} />
              <h2>{t(language, "wiki.relatedPhotos")}</h2>
              <DetailLinks record={detailQuery.data.related.photos} onOpen={openRecord} language={language} />
              <h2>{t(language, "wiki.relatedDocuments")}</h2>
              <DetailLinks record={detailQuery.data.related.documents} onOpen={openRecord} language={language} />
            </div>
            <div className="pool-card property-wiki-summary">
              <h2>{t(language, "wiki.recentChanges")}</h2>
              {detailQuery.data.history.length === 0 ? <p className="muted">{t(language, "wiki.noRecentChanges")}</p> : detailQuery.data.history.map((item) => (
                <article key={item.id} className="pool-history-row">
                  <div>
                    <strong>{item.user}</strong>
                    <span>{item.action}</span>
                  </div>
                  <span>{formatDate(item.date)}</span>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {overviewQuery.isLoading ? (
        <StatusState title={t(language, "wiki.loadingTitle")} description={t(language, "wiki.loadingCopy")} />
      ) : overviewQuery.isError ? (
        <StatusState title={t(language, "wiki.failedTitle")} description={t(language, "wiki.failedCopy")} tone="error" />
      ) : (
        <>
          {activeTab === "overview" ? (
            <div className="property-wiki-grid">
              <form
                className="pool-card pool-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveProfileMutation.mutate({
                    propertyId,
                    address: profileDraft.address || null,
                    unitCount: profileDraft.unitCount ? Number(profileDraft.unitCount) : null,
                    buildingCount: profileDraft.buildingCount ? Number(profileDraft.buildingCount) : null,
                    officePhone: profileDraft.officePhone || null,
                    afterHoursPhone: profileDraft.afterHoursPhone || null,
                    propertyManager: profileDraft.propertyManager || null,
                    maintenanceSupervisor: profileDraft.maintenanceSupervisor || null,
                    regionalManager: profileDraft.regionalManager || null,
                    generalNotes: profileDraft.generalNotes || null,
                  });
                }}
              >
                <h2>{t(language, "wiki.propertyOverview")}</h2>
                <input
                  className="property-wiki-large-search"
                  placeholder={t(language, "wiki.searchThisProperty")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setActiveTab("search");
                    }
                  }}
                />
                <div className="form-grid">
                  <label>{t(language, "wiki.address")}<input value={profileDraft.address} onChange={(event) => setProfileDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                  <label>{t(language, "wiki.unitCount")}<input type="number" value={profileDraft.unitCount} onChange={(event) => setProfileDraft((current) => ({ ...current, unitCount: event.target.value }))} /></label>
                  <label>{t(language, "wiki.buildingCount")}<input type="number" value={profileDraft.buildingCount} onChange={(event) => setProfileDraft((current) => ({ ...current, buildingCount: event.target.value }))} /></label>
                  <label>{t(language, "wiki.officePhone")}<input value={profileDraft.officePhone} onChange={(event) => setProfileDraft((current) => ({ ...current, officePhone: event.target.value }))} /></label>
                  <label>{t(language, "wiki.afterHoursPhone")}<input value={profileDraft.afterHoursPhone} onChange={(event) => setProfileDraft((current) => ({ ...current, afterHoursPhone: event.target.value }))} /></label>
                  <label>{t(language, "wiki.propertyManager")}<input value={profileDraft.propertyManager} onChange={(event) => setProfileDraft((current) => ({ ...current, propertyManager: event.target.value }))} /></label>
                </div>
                <label>{t(language, "wiki.generalNotes")}<textarea rows={4} value={profileDraft.generalNotes} onChange={(event) => setProfileDraft((current) => ({ ...current, generalNotes: event.target.value }))} /></label>
                {access.edit ? <button type="submit" className="button button-primary">{t(language, "wiki.saveOverview")}</button> : null}
              </form>

              <div className="pool-card property-wiki-summary">
                <h2>{t(language, "wiki.favorites")}</h2>
                {(overviewQuery.data?.favorites ?? []).length === 0 ? <p className="muted">{t(language, "wiki.noFavoritesYet")}</p> : (overviewQuery.data?.favorites ?? []).map((item) => renderSummaryRow(item, true))}
                <h2>{t(language, "wiki.recentlyViewed")}</h2>
                {(overviewQuery.data?.recentlyViewed ?? []).length === 0 ? <p className="muted">{t(language, "wiki.noRecentViewsYet")}</p> : (overviewQuery.data?.recentlyViewed ?? []).map((item) => (
                  <article key={`${item.targetType}-${item.id}`} className="property-wiki-record compact">
                    <div>
                      <strong>{item.title}</strong>
                      <span>{sectionLabel(item.section, language)}{item.building ? ` / ${item.building}` : ""}</span>
                      <small>{t(language, "wiki.viewed")} {formatDate(item.viewedAt)}</small>
                    </div>
                    <div className="pool-entry-actions">
                      <button type="button" className="button button-secondary" onClick={() => openRecord(item.targetType, item.id)}>{t(language, "wiki.open")}</button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="pool-card property-wiki-summary">
                <h2>{t(language, "wiki.pinnedKnowledge")}</h2>
                {(overviewQuery.data?.pinnedCriticalInformation ?? []).length === 0 ? <p className="muted">{t(language, "wiki.noPinnedItemsYet")}</p> : (overviewQuery.data?.pinnedCriticalInformation ?? []).map((entry) => (
                  <article key={entry.id} className="pool-history-row">
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{sectionLabel(entry.section, language)}{entry.building ? ` / ${entry.building}` : ""}</span>
                    </div>
                    <div className="pool-entry-actions">
                      <button type="button" className="button button-secondary" onClick={() => openRecord("ENTRY", entry.id)}>{t(language, "wiki.open")}</button>
                    </div>
                  </article>
                ))}
                <h2>{t(language, "wiki.emergencyContacts")}</h2>
                {(overviewQuery.data?.emergencyContacts ?? []).length === 0 ? <p className="muted">{t(language, "wiki.noEmergencyContactsYet")}</p> : (overviewQuery.data?.emergencyContacts ?? []).map((entry) => (
                  <article key={entry.id} className="property-wiki-contact-card emergency">
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{entry.contactType || t(language, "wiki.contactFallback")}{entry.contactTitle ? ` / ${entry.contactTitle}` : ""}</span>
                    </div>
                    <div className="property-wiki-contact-actions">
                      {entry.phone ? <a href={`tel:${entry.phone}`}>{entry.phone}</a> : null}
                      {entry.email ? <a href={`mailto:${entry.email}`}>{entry.email}</a> : null}
                    </div>
                  </article>
                ))}
              </div>

              <div className="pool-card property-wiki-summary">
                <h2>{t(language, "wiki.recentlyUpdated")}</h2>
                {(overviewQuery.data?.recentlyUpdated ?? []).slice(0, 8).map((entry) => (
                  <article key={entry.id} className="pool-history-row">
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{sectionLabel(entry.section, language)}{entry.building ? ` / ${entry.building}` : ""}</span>
                    </div>
                    <div className="pool-entry-actions">
                      <button type="button" className="button button-secondary" onClick={() => openRecord("ENTRY", entry.id)}>{t(language, "wiki.open")}</button>
                    </div>
                  </article>
                ))}
                <h2>{t(language, "wiki.quickAdd")}</h2>
                <div className="property-wiki-quick-actions">
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("utilities")}>{t(language, "wiki.addUtility")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("equipment")}>{t(language, "wiki.addEquipment")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("vendors")}>{t(language, "wiki.addVendor")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("contacts")}>{t(language, "wiki.addContact")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("sops")}>{t(language, "wiki.addSop")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("issues")}>{t(language, "wiki.addIssue")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("documents", "DOCUMENT")}>{t(language, "wiki.uploadDocument")}</button>
                  <button type="button" className="button button-secondary" onClick={() => openQuickAdd("photos", "PHOTO")}>{t(language, "wiki.uploadPhoto")}</button>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "emergencyMode" ? (
            <div className="property-wiki-emergency-mode">
              {(overviewQuery.data?.emergencyMode ?? []).length === 0 ? <StatusState title={t(language, "wiki.noEmergencyRecordsTitle")} description={t(language, "wiki.noEmergencyRecordsCopy")} /> : (overviewQuery.data?.emergencyMode ?? []).map((item) => (
                <button key={`${item.targetType}-${item.id}`} type="button" className="property-wiki-emergency-tile" onClick={() => openRecord(item.targetType, item.id)}>
                  <strong>{item.title}</strong>
                  <span>{sectionLabel(item.section, language)}{item.building ? ` / ${item.building}` : ""}</span>
                  <p>{item.snippet}</p>
                </button>
              ))}
            </div>
          ) : null}

          {section ? (
            <div className="property-wiki-grid">
              <form className="pool-card pool-form" onSubmit={(event) => {
                event.preventDefault();
                void saveEntryMutation.mutate(entryDraft);
              }}>
                <h2>{editingEntryId ? t(language, "wiki.editRecord") : `${t(language, "wiki.add")} ${sectionLabel(section, language)}`}</h2>
                <div className="form-grid">
                  <label>{section === "PROPERTY_CONTACTS" ? t(language, "admin.name") : t(language, "wiki.titleField")}<input required value={entryDraft.title} onChange={(event) => setEntryDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                  {section !== "KNOWN_ISSUES" ? <label>{t(language, "wiki.category")}
                    {currentCategories.length ? (
                      <select value={entryDraft.category} onChange={(event) => setEntryDraft((current) => ({ ...current, category: event.target.value }))}>
                        <option value="">{t(language, "wiki.selectCategory")}</option>
                        {currentCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    ) : <input value={entryDraft.category} onChange={(event) => setEntryDraft((current) => ({ ...current, category: event.target.value }))} />}
                  </label> : null}
                  {["UTILITIES", "EQUIPMENT_REGISTRY", "SOP_LIBRARY", "CUSTOM_PAGES", "KNOWN_ISSUES"].includes(section) ? <label>{t(language, "wiki.building")}<input value={entryDraft.building} onChange={(event) => setEntryDraft((current) => ({ ...current, building: event.target.value }))} /></label> : null}
                  {["UTILITIES", "ACCESS_CONTROL", "EQUIPMENT_REGISTRY", "POOLS"].includes(section) ? <label>{t(language, "wiki.location")}<input value={entryDraft.locationDescription} onChange={(event) => setEntryDraft((current) => ({ ...current, locationDescription: event.target.value }))} /></label> : null}
                  {section === "EQUIPMENT_REGISTRY" ? <label>{t(language, "wiki.manufacturer")}<input value={entryDraft.manufacturer} onChange={(event) => setEntryDraft((current) => ({ ...current, manufacturer: event.target.value }))} /></label> : null}
                  {section === "EQUIPMENT_REGISTRY" ? <label>{t(language, "wiki.model")}<input value={entryDraft.equipmentModel} onChange={(event) => setEntryDraft((current) => ({ ...current, equipmentModel: event.target.value }))} /></label> : null}
                  {section === "EQUIPMENT_REGISTRY" ? <label>{t(language, "wiki.serialNumber")}<input value={entryDraft.serialNumber} onChange={(event) => setEntryDraft((current) => ({ ...current, serialNumber: event.target.value }))} /></label> : null}
                  {section === "EQUIPMENT_REGISTRY" ? <label>{t(language, "wiki.installDate")}<input type="date" value={entryDraft.installDate} onChange={(event) => setEntryDraft((current) => ({ ...current, installDate: event.target.value }))} /></label> : null}
                  {section === "EQUIPMENT_REGISTRY" ? <label>{t(language, "wiki.warrantyExpires")}<input type="date" value={entryDraft.warrantyExpiresAt} onChange={(event) => setEntryDraft((current) => ({ ...current, warrantyExpiresAt: event.target.value }))} /></label> : null}
                  {section === "UNIT_STANDARDS" ? <label>{t(language, "wiki.floorPlan")}<input value={entryDraft.floorPlan} onChange={(event) => setEntryDraft((current) => ({ ...current, floorPlan: event.target.value }))} /></label> : null}
                  {section === "UNIT_STANDARDS" ? <label>{t(language, "wiki.unitType")}<input value={entryDraft.unitType} onChange={(event) => setEntryDraft((current) => ({ ...current, unitType: event.target.value }))} /></label> : null}
                  {section === "UNIT_STANDARDS" ? <label>{t(language, "wiki.filterSizes")}<input value={entryDraft.filterSizes} onChange={(event) => setEntryDraft((current) => ({ ...current, filterSizes: event.target.value }))} /></label> : null}
                  {section === "UNIT_STANDARDS" ? <label>{t(language, "wiki.blindSizes")}<input value={entryDraft.blindSizes} onChange={(event) => setEntryDraft((current) => ({ ...current, blindSizes: event.target.value }))} /></label> : null}
                  {section === "PROPERTY_CONTACTS" ? <label>{t(language, "wiki.contactType")}
                    <select value={entryDraft.contactType} onChange={(event) => setEntryDraft((current) => ({ ...current, contactType: event.target.value }))}>
                      <option value="">{t(language, "wiki.selectType")}</option>
                      {(overviewQuery.data?.categories.propertyContacts ?? []).map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label> : null}
                  {section === "PROPERTY_CONTACTS" ? <label>{t(language, "wiki.titleField")}<input value={entryDraft.contactTitle} onChange={(event) => setEntryDraft((current) => ({ ...current, contactTitle: event.target.value }))} /></label> : null}
                  {section === "PROPERTY_CONTACTS" ? <label>{t(language, "wiki.phone")}<input value={entryDraft.phone} onChange={(event) => setEntryDraft((current) => ({ ...current, phone: event.target.value }))} /></label> : null}
                  {section === "PROPERTY_CONTACTS" ? <label>{t(language, "wiki.email")}<input value={entryDraft.email} onChange={(event) => setEntryDraft((current) => ({ ...current, email: event.target.value }))} /></label> : null}
                  {section === "EMERGENCY_PROCEDURES" ? <label>{t(language, "wiki.situation")}<input value={entryDraft.situation} onChange={(event) => setEntryDraft((current) => ({ ...current, situation: event.target.value }))} /></label> : null}
                  {section === "KNOWN_ISSUES" ? <label>{t(language, "admin.status")}
                    <select value={entryDraft.issueStatus} onChange={(event) => setEntryDraft((current) => ({ ...current, issueStatus: event.target.value as EntryDraft["issueStatus"] }))}>
                      {(overviewQuery.data?.categories.knownIssueStatuses ?? []).map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label> : null}
                </div>

                {section === "UNIT_STANDARDS" ? <>
                  <label>{t(language, "wiki.hvacNotes")}<textarea rows={3} value={entryDraft.hvacNotes} onChange={(event) => setEntryDraft((current) => ({ ...current, hvacNotes: event.target.value }))} /></label>
                  <label>{t(language, "wiki.waterHeaterNotes")}<textarea rows={3} value={entryDraft.waterHeaterNotes} onChange={(event) => setEntryDraft((current) => ({ ...current, waterHeaterNotes: event.target.value }))} /></label>
                  <label>{t(language, "wiki.applianceNotes")}<textarea rows={3} value={entryDraft.applianceNotes} onChange={(event) => setEntryDraft((current) => ({ ...current, applianceNotes: event.target.value }))} /></label>
                  <label>{t(language, "wiki.paintStandards")}<textarea rows={3} value={entryDraft.paintStandards} onChange={(event) => setEntryDraft((current) => ({ ...current, paintStandards: event.target.value }))} /></label>
                  <label>{t(language, "wiki.countertopNotes")}<textarea rows={3} value={entryDraft.countertopNotes} onChange={(event) => setEntryDraft((current) => ({ ...current, countertopNotes: event.target.value }))} /></label>
                  <label>{t(language, "wiki.cabinetNotes")}<textarea rows={3} value={entryDraft.cabinetNotes} onChange={(event) => setEntryDraft((current) => ({ ...current, cabinetNotes: event.target.value }))} /></label>
                  <label>{t(language, "wiki.flooringNotes")}<textarea rows={3} value={entryDraft.flooringNotes} onChange={(event) => setEntryDraft((current) => ({ ...current, flooringNotes: event.target.value }))} /></label>
                </> : null}

                {section === "SOP_LIBRARY" ? <>
                  <label>{t(language, "wiki.relatedContacts")}
                    <select multiple value={entryDraft.relatedEntryIds.filter((id) => contactOptions.some((entry) => entry.id === id))} onChange={(event) => setEntryDraft((current) => ({ ...current, relatedEntryIds: [...new Set([...current.relatedEntryIds.filter((id) => !contactOptions.some((entry) => entry.id === id)), ...selectedValues(event)])] }))}>
                      {contactOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                    </select>
                  </label>
                  <label>{t(language, "wiki.relatedEquipment")}
                    <select multiple value={entryDraft.relatedEntryIds.filter((id) => equipmentOptions.some((entry) => entry.id === id))} onChange={(event) => setEntryDraft((current) => ({ ...current, relatedEntryIds: [...new Set([...current.relatedEntryIds.filter((id) => !equipmentOptions.some((entry) => entry.id === id)), ...selectedValues(event)])] }))}>
                      {equipmentOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                    </select>
                  </label>
                  <label>{t(language, "wiki.relatedVendors")}
                    <select multiple value={entryDraft.relatedVendorIds} onChange={(event) => setEntryDraft((current) => ({ ...current, relatedVendorIds: selectedValues(event) }))}>
                      {wikiVendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}
                    </select>
                  </label>
                  <label>{t(language, "wiki.steps")}<textarea rows={8} value={entryDraft.content} onChange={(event) => setEntryDraft((current) => ({ ...current, content: event.target.value }))} /></label>
                </> : null}

                {section === "KNOWN_ISSUES" ? <>
                  <label>{t(language, "wiki.issueDescription")}<textarea rows={4} value={entryDraft.notes} onChange={(event) => setEntryDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <label>{t(language, "wiki.recommendedAction")}<textarea rows={4} value={entryDraft.content} onChange={(event) => setEntryDraft((current) => ({ ...current, content: event.target.value }))} /></label>
                </> : null}

                {section === "EMERGENCY_PROCEDURES" ? <label>{t(language, "wiki.steps")}<textarea rows={7} value={entryDraft.content} onChange={(event) => setEntryDraft((current) => ({ ...current, content: event.target.value }))} /></label> : null}
                {section === "CUSTOM_PAGES" ? <label>{t(language, "wiki.content")}<textarea rows={8} value={entryDraft.content} onChange={(event) => setEntryDraft((current) => ({ ...current, content: event.target.value }))} /></label> : null}
                {section !== "SOP_LIBRARY" && section !== "EMERGENCY_PROCEDURES" && section !== "CUSTOM_PAGES" && section !== "KNOWN_ISSUES" ? <label>{t(language, "wiki.notes")}<textarea rows={4} value={entryDraft.notes} onChange={(event) => setEntryDraft((current) => ({ ...current, notes: event.target.value }))} /></label> : null}
                <label>{t(language, "wiki.tags")}<input value={entryDraft.tags} onChange={(event) => setEntryDraft((current) => ({ ...current, tags: event.target.value }))} /></label>
                {section === "PROPERTY_CONTACTS" ? <label className="checkbox-row"><input type="checkbox" checked={entryDraft.isEmergencyContact} onChange={(event) => setEntryDraft((current) => ({ ...current, isEmergencyContact: event.target.checked }))} /> {t(language, "wiki.emergencyContact")}</label> : null}
                {access.canPin ? <label className="checkbox-row"><input type="checkbox" checked={entryDraft.isPinned} onChange={(event) => setEntryDraft((current) => ({ ...current, isPinned: event.target.checked }))} /> {t(language, "wiki.pinToOverview")}</label> : null}
                {access.canEmergency && ["UTILITIES", "EQUIPMENT_REGISTRY", "SOP_LIBRARY", "KNOWN_ISSUES"].includes(section) ? <label className="checkbox-row"><input type="checkbox" checked={entryDraft.isEmergency} onChange={(event) => setEntryDraft((current) => ({ ...current, isEmergency: event.target.checked }))} /> {t(language, "wiki.includeEmergencyMode")}</label> : null}
                {editingEntryId ? <label className="checkbox-row"><input type="checkbox" checked={entryDraft.isActive} onChange={(event) => setEntryDraft((current) => ({ ...current, isActive: event.target.checked }))} /> {t(language, "wiki.activeRecord")}</label> : null}
                <div className="row-actions">
                  {access.edit ? <button type="submit" className="button button-primary">{editingEntryId ? t(language, "wiki.saveChanges") : t(language, "wiki.createRecord")}</button> : null}
                  {editingEntryId ? <button type="button" className="button button-secondary" onClick={() => {
                    setEditingEntryId(null);
                    setEntryDraft(emptyEntryDraft(section));
                  }}>{t(language, "common.cancel")}</button> : null}
                </div>
              </form>

              <div className="pool-card">
                <div className="property-wiki-list-header">
                  <h2>{sectionLabel(section, language)}</h2>
                  <input placeholder={tWithVars(language, "wiki.filterSection", { section: sectionLabel(section, language).toLowerCase() })} value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} />
                </div>
                {entriesQuery.isLoading ? <p className="muted">{t(language, "wiki.loadingRecords")}</p> : (
                  <>
                    <div className="stack gap-sm">
                      <div className="section-header">
                        <strong>{t(language, "wiki.activeRecord")}</strong>
                        <span className="muted">{activeEntries.length}</span>
                      </div>
                      {activeEntries.length === 0 ? <p className="muted">{t(language, "wiki.noRecordsInSectionYet")}</p> : activeEntries.map((entry) => (
                        <article key={entry.id} className={`property-wiki-record${entry.isEmergency ? " emergency" : ""}`}>
                          <div>
                            <strong>{entry.title}</strong>
                            <span>{entry.category || entry.contactType || sectionLabel(entry.section, language)}{entry.building ? ` / ${entry.building}` : ""}{entry.locationDescription ? ` / ${entry.locationDescription}` : ""}</span>
                            {entry.issueStatus ? <small>{t(language, "admin.status")}: {entry.issueStatus}</small> : null}
                            {entry.manufacturer || entry.equipmentModel ? <small>{[entry.manufacturer, entry.equipmentModel].filter(Boolean).join(" / ")}</small> : null}
                            <p>{recordSummary(entry) || t(language, "wiki.noSummaryYet")}</p>
                            {renderTags(entry.tags)}
                          </div>
                          <div className="pool-entry-actions">
                            {section === "UNIT_STANDARDS" && access.edit ? <button type="button" className="button button-secondary" onClick={() => duplicateStandard(entry)}>{t(language, "wiki.duplicate")}</button> : null}
                            {canFavoriteRecord(entry.section, "ENTRY") ? <button type="button" className="button button-secondary" onClick={() => toggleFavorite("ENTRY", entry.id)}>{t(language, "wiki.favorite")}</button> : null}
                            <button type="button" className="button button-secondary" onClick={() => openRecord("ENTRY", entry.id)}>{t(language, "wiki.view")}</button>
                            {access.edit ? <button type="button" className="button button-secondary" onClick={() => loadEntryForEdit(entry)}>{t(language, "drawer.edit")}</button> : null}
                            {access.edit ? <button type="button" className="button button-secondary" onClick={() => setEntryActiveState(entry, false)}>{t(language, "wiki.archived")}</button> : null}
                          </div>
                        </article>
                      ))}
                    </div>

                    {archivedEntries.length > 0 ? (
                      <div className="stack gap-sm" style={{ marginTop: 16 }}>
                        <div className="section-header">
                          <strong>{t(language, "wiki.archived")}</strong>
                          <span className="muted">{archivedEntries.length}</span>
                        </div>
                        {archivedEntries.map((entry) => (
                          <article key={entry.id} className={`property-wiki-record${entry.isEmergency ? " emergency" : ""}`}>
                            <div>
                              <strong>{entry.title}</strong>
                              <span>{entry.category || entry.contactType || sectionLabel(entry.section, language)}{entry.building ? ` / ${entry.building}` : ""}{entry.locationDescription ? ` / ${entry.locationDescription}` : ""}{` / ${t(language, "wiki.archived")}`}</span>
                              {entry.issueStatus ? <small>{t(language, "admin.status")}: {entry.issueStatus}</small> : null}
                              {entry.manufacturer || entry.equipmentModel ? <small>{[entry.manufacturer, entry.equipmentModel].filter(Boolean).join(" / ")}</small> : null}
                              <p>{recordSummary(entry) || t(language, "wiki.noSummaryYet")}</p>
                              {renderTags(entry.tags)}
                            </div>
                            <div className="pool-entry-actions">
                              {canFavoriteRecord(entry.section, "ENTRY") ? <button type="button" className="button button-secondary" onClick={() => toggleFavorite("ENTRY", entry.id)}>{t(language, "wiki.favorite")}</button> : null}
                              <button type="button" className="button button-secondary" onClick={() => openRecord("ENTRY", entry.id)}>{t(language, "wiki.view")}</button>
                              {access.edit ? <button type="button" className="button button-secondary" onClick={() => loadEntryForEdit(entry)}>{t(language, "drawer.edit")}</button> : null}
                              {access.edit ? <button type="button" className="button button-secondary" onClick={() => setEntryActiveState(entry, true)}>{t(language, "common.restore")}</button> : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "vendors" ? (
            <div className="property-wiki-grid">
              <form className="pool-card pool-form" onSubmit={(event) => {
                event.preventDefault();
                void saveVendorMutation.mutate(vendorDraft);
              }}>
                <h2>{editingVendorId ? t(language, "wiki.editVendor") : t(language, "wiki.addVendor")}</h2>
                <div className="form-grid">
                  <label>{t(language, "wiki.vendorType")}
                    <select value={vendorDraft.vendorType} onChange={(event) => setVendorDraft((current) => ({ ...current, vendorType: event.target.value }))}>
                      {(overviewQuery.data?.categories.vendorTypes ?? []).map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>{t(language, "wiki.company")}<input required value={vendorDraft.companyName} onChange={(event) => setVendorDraft((current) => ({ ...current, companyName: event.target.value }))} /></label>
                  <label>{t(language, "wiki.contact")}<input value={vendorDraft.contactName} onChange={(event) => setVendorDraft((current) => ({ ...current, contactName: event.target.value }))} /></label>
                  <label>{t(language, "wiki.phone")}<input value={vendorDraft.phone} onChange={(event) => setVendorDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label>{t(language, "wiki.email")}<input value={vendorDraft.email} onChange={(event) => setVendorDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>{t(language, "wiki.emergencyPhone")}<input value={vendorDraft.emergencyPhone} onChange={(event) => setVendorDraft((current) => ({ ...current, emergencyPhone: event.target.value }))} /></label>
                </div>
                <label>{t(language, "wiki.notes")}<textarea rows={4} value={vendorDraft.notes} onChange={(event) => setVendorDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
                <label className="checkbox-row"><input type="checkbox" checked={vendorDraft.isActive} onChange={(event) => setVendorDraft((current) => ({ ...current, isActive: event.target.checked }))} /> {t(language, "wiki.activeVendor")}</label>
                <div className="row-actions">
                  {access.edit ? <button type="submit" className="button button-primary">{editingVendorId ? t(language, "wiki.saveVendor") : t(language, "wiki.createVendor")}</button> : null}
                </div>
              </form>
              <div className="pool-card">
                <h2>{t(language, "wiki.vendorDirectory")}</h2>
                <div className="stack gap-sm">
                  <div className="section-header">
                    <strong>{t(language, "wiki.activeVendor")}</strong>
                    <span className="muted">{activeWikiVendors.length}</span>
                  </div>
                  {activeWikiVendors.map((vendor) => (
                    <article key={vendor.id} className="property-wiki-record">
                      <div>
                        <strong>{vendor.companyName}</strong>
                        <span>{vendor.vendorType}{vendor.contactName ? ` / ${vendor.contactName}` : ""}</span>
                        <p>{vendor.notes || vendor.phone || vendor.email || vendor.emergencyPhone || t(language, "wiki.noDetailsYet")}</p>
                      </div>
                      <div className="pool-entry-actions">
                        <button type="button" className="button button-secondary" onClick={() => toggleFavorite("VENDOR", vendor.id)}>{t(language, "wiki.favorite")}</button>
                        <button type="button" className="button button-secondary" onClick={() => openRecord("VENDOR", vendor.id)}>{t(language, "wiki.view")}</button>
                        {access.edit ? <button type="button" className="button button-secondary" onClick={() => setVendorActiveState(vendor, false)}>{t(language, "wiki.archived")}</button> : null}
                      </div>
                    </article>
                  ))}
                </div>
                {archivedWikiVendors.length > 0 ? (
                  <div className="stack gap-sm" style={{ marginTop: 16 }}>
                    <div className="section-header">
                      <strong>{t(language, "wiki.inactive")}</strong>
                      <span className="muted">{archivedWikiVendors.length}</span>
                    </div>
                    {archivedWikiVendors.map((vendor) => (
                      <article key={vendor.id} className="property-wiki-record">
                        <div>
                          <strong>{vendor.companyName}</strong>
                          <span>{vendor.vendorType}{vendor.contactName ? ` / ${vendor.contactName}` : ""}{` / ${t(language, "wiki.inactive")}`}</span>
                          <p>{vendor.notes || vendor.phone || vendor.email || vendor.emergencyPhone || t(language, "wiki.noDetailsYet")}</p>
                        </div>
                        <div className="pool-entry-actions">
                          <button type="button" className="button button-secondary" onClick={() => toggleFavorite("VENDOR", vendor.id)}>{t(language, "wiki.favorite")}</button>
                          <button type="button" className="button button-secondary" onClick={() => openRecord("VENDOR", vendor.id)}>{t(language, "wiki.view")}</button>
                          {access.edit ? <button type="button" className="button button-secondary" onClick={() => setVendorActiveState(vendor, true)}>{t(language, "common.restore")}</button> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {(activeTab === "documents" || activeTab === "photos") ? (
            <div className="property-wiki-grid">
              <form className="pool-card pool-form" onSubmit={(event) => event.preventDefault()}>
                <h2>{activeTab === "photos" ? t(language, "wiki.uploadPhoto") : t(language, "wiki.uploadDocument")}</h2>
                <div className="form-grid">
                  <label>{t(language, "wiki.titleField")}<input required value={assetDraft.title} onChange={(event) => setAssetDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label>{t(language, "wiki.category")}
                    <select value={assetDraft.category} onChange={(event) => setAssetDraft((current) => ({ ...current, category: event.target.value }))}>
                      <option value="">{t(language, "wiki.selectCategory")}</option>
                      {currentCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label>{t(language, "wiki.building")}<input value={assetDraft.building} onChange={(event) => setAssetDraft((current) => ({ ...current, building: event.target.value }))} /></label>
                  <label>{t(language, "wiki.relatedEntry")}
                    <select value={assetDraft.entryId} onChange={(event) => setAssetDraft((current) => ({ ...current, entryId: event.target.value }))}>
                      <option value="">{t(language, "wiki.none")}</option>
                      {allEntries.filter((entry) => entry.isActive).map((entry) => <option key={entry.id} value={entry.id}>{sectionLabel(entry.section, language)} - {entry.title}</option>)}
                    </select>
                  </label>
                </div>
                <label>{t(language, "wiki.description")}<textarea rows={4} value={assetDraft.description} onChange={(event) => setAssetDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                <label>{t(language, "wiki.tags")}<input value={assetDraft.tags} onChange={(event) => setAssetDraft((current) => ({ ...current, tags: event.target.value }))} /></label>
                {access.canEmergency ? <label className="checkbox-row"><input type="checkbox" checked={assetDraft.isEmergency} onChange={(event) => setAssetDraft((current) => ({ ...current, isEmergency: event.target.checked }))} /> {t(language, "wiki.includeEmergencyMode")}</label> : null}
                <label>{t(language, "wiki.file")}
                  <input type="file" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file || !assetDraft.title.trim()) return;
                    void uploadAssetMutation.mutate({
                      propertyId,
                      kind: activeTab === "photos" ? "PHOTO" : "DOCUMENT",
                      title: assetDraft.title,
                      category: assetDraft.category || null,
                      building: assetDraft.building || null,
                      description: assetDraft.description || null,
                      tags: assetDraft.tags,
                      isEmergency: assetDraft.isEmergency,
                      entryId: assetDraft.entryId || null,
                      vendorId: assetDraft.vendorId || null,
                      file,
                    });
                    event.currentTarget.value = "";
                  }} />
                </label>
              </form>
              <div className="pool-card">
                <h2>{activeTab === "photos" ? t(language, "wiki.photoLibrary") : t(language, "wiki.documentLibrary")}</h2>
                {activeWikiAssets.map((asset) => (
                  <article key={asset.id} className={`property-wiki-record${asset.isEmergency ? " emergency" : ""}`}>
                    <div>
                      <strong>{asset.title}</strong>
                      <span>{asset.category || (asset.kind === "PHOTO" ? t(language, "wiki.photo") : t(language, "wiki.document"))}{asset.building ? ` / ${asset.building}` : ""}</span>
                      <p>{asset.description || asset.originalName}</p>
                      {renderTags(asset.tags)}
                    </div>
                    <div className="pool-entry-actions">
                      <button type="button" className="button button-secondary" onClick={() => toggleFavorite("ASSET", asset.id)}>{t(language, "wiki.favorite")}</button>
                      <button type="button" className="button button-secondary" onClick={() => openRecord("ASSET", asset.id)}>{t(language, "wiki.view")}</button>
                      <a className="button button-secondary" href={propertyWikiAssetDownloadUrl(asset.id)} target="_blank" rel="noreferrer">{t(language, "wiki.open")}</a>
                      {access.edit ? <button type="button" className="button button-secondary" onClick={() => setAssetActiveState(asset, false)}>{t(language, "common.archive")}</button> : null}
                    </div>
                  </article>
                ))}
                {archivedWikiAssets.length > 0 ? (
                  <div className="pool-archived-list">
                    <h3>{t(language, "wiki.archived")}</h3>
                    {archivedWikiAssets.map((asset) => (
                      <article key={`archived-${asset.id}`} className="property-wiki-record compact">
                        <div>
                          <strong>{asset.title}</strong>
                          <span>{asset.category || (asset.kind === "PHOTO" ? t(language, "wiki.photo") : t(language, "wiki.document"))}{asset.building ? ` / ${asset.building}` : ""}{` / ${t(language, "wiki.archived")}`}</span>
                          <p>{asset.description || asset.originalName}</p>
                          {renderTags(asset.tags)}
                        </div>
                        <div className="pool-entry-actions">
                          {access.edit ? <button type="button" className="button button-secondary" onClick={() => setAssetActiveState(asset, true)}>{t(language, "common.restore")}</button> : null}
                          {access.edit ? <button type="button" className="button button-danger" onClick={() => void deleteAssetMutation.mutate(asset.id)}>{t(language, "wiki.delete")}</button> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "search" ? (
            <div className="pool-card property-wiki-search-results">
              <h2>{t(language, "wiki.searchResults")}</h2>
              {!searchQuery.trim() ? <p className="muted">{t(language, "wiki.searchHelp")}</p> : (searchQueryResult.data?.results ?? []).map((result) => renderSummaryRow({
                targetType: result.targetType,
                id: result.id,
                propertyId: result.propertyId,
                property: result.property,
                section: result.section,
                title: result.title,
                snippet: result.snippet,
                tags: result.tags,
                updatedAt: result.updatedAt,
                building: result.building,
                isFavorite: result.isFavorite,
                isEmergency: result.isEmergency,
              }))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
