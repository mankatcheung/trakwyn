import React, { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import { AwardsSection } from '../components/experience/AwardsSection';
import { CertificationsSection } from '../components/experience/CertificationsSection';
import { EducationSection } from '../components/experience/EducationSection';
import { LanguagesSection } from '../components/experience/LanguagesSection';
import { ProjectsSection } from '../components/experience/ProjectsSection';
import { SkillsSection } from '../components/experience/SkillsSection';
import { WorkExperienceSection } from '../components/experience/WorkExperienceSection';
import { createExperienceStyles } from '../components/experience/experienceStyles';

/** The profile's sections, in the order the resume uses them. */
export function ExperienceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <WorkExperienceSection />
      <EducationSection />
      <SkillsSection />
      <CertificationsSection />
      <LanguagesSection />
      <ProjectsSection />
      <AwardsSection />
    </ScrollView>
  );
}
