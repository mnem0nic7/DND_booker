import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { FontSize } from '../extensions/FontSize';
import { DropCap } from '../extensions/DropCap';
import { StableNodeIds } from '../extensions/StableNodeIds';
import { AutoPagination } from '../extensions/AutoPagination';
import { StatBlock } from '../components/blocks/StatBlock/StatBlockExtension';
import { ReadAloudBox } from '../components/blocks/ReadAloudBox/ReadAloudBoxExtension';
import { SidebarCallout } from '../components/blocks/SidebarCallout/SidebarCalloutExtension';
import { ChapterHeader } from '../components/blocks/ChapterHeader/ChapterHeaderExtension';
import { SpellCard } from '../components/blocks/SpellCard/SpellCardExtension';
import { MagicItem } from '../components/blocks/MagicItem/MagicItemExtension';
import { RandomTable } from '../components/blocks/RandomTable/RandomTableExtension';
import { NpcProfile } from '../components/blocks/NpcProfile/NpcProfileExtension';
import { EncounterTable } from '../components/blocks/EncounterTable/EncounterTableExtension';
import { ClassFeature } from '../components/blocks/ClassFeature/ClassFeatureExtension';
import { RaceBlock } from '../components/blocks/RaceBlock/RaceBlockExtension';
import { FullBleedImage } from '../components/blocks/FullBleedImage/FullBleedImageExtension';
import { MapBlock } from '../components/blocks/MapBlock/MapBlockExtension';
import { Handout } from '../components/blocks/Handout/HandoutExtension';
import { PageBorder } from '../components/blocks/PageBorder/PageBorderExtension';
import { PageBreak } from '../components/blocks/PageBreak/PageBreakExtension';
import { ColumnBreak } from '../components/blocks/ColumnBreak/ColumnBreakExtension';
import { TitlePage } from '../components/blocks/TitlePage/TitlePageExtension';
import { TableOfContents } from '../components/blocks/TableOfContents/TableOfContentsExtension';
import { CreditsPage } from '../components/blocks/CreditsPage/CreditsPageExtension';
import { BackCover } from '../components/blocks/BackCover/BackCoverExtension';

export function buildEditorExtensions(options?: {
  includeAutoPagination?: boolean;
}): AnyExtension[] {
  const includeAutoPagination = options?.includeAutoPagination ?? false;

  const extensions: AnyExtension[] = [
    StarterKit.configure({ link: false, underline: false }),
    Underline,
    Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Superscript,
    Subscript,
    Highlight.configure({ multicolor: true }),
    TextStyle,
    FontSize,
    DropCap,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    StableNodeIds,
    StatBlock,
    ReadAloudBox,
    SidebarCallout,
    ChapterHeader,
    SpellCard,
    MagicItem,
    RandomTable,
    NpcProfile,
    EncounterTable,
    ClassFeature,
    RaceBlock,
    FullBleedImage,
    MapBlock,
    Handout,
    PageBorder,
    PageBreak,
    ColumnBreak,
    TitlePage,
    TableOfContents,
    CreditsPage,
    BackCover,
  ];

  if (includeAutoPagination) {
    extensions.push(AutoPagination);
  }

  return extensions;
}
