<!-- This is a clean rewrite of the hierarchy processing -->
<template>
  <div class="agent-tree-container">
    <!-- Search -->
    <div class="search-container">
      <ion-searchbar
        v-model="searchQuery"
        placeholder="Search agents..."
        show-clear-button="focus"
        @ionInput="filterAgents"
      />
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-container">
      <ion-spinner />
      <p>Loading agents...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-container">
      <ion-icon :icon="icons.alertCircleOutline" color="danger" />
      <p>{{ error }}</p>
      <ion-button fill="outline" @click="refreshData">Retry</ion-button>
    </div>

    <!-- Hierarchy Display -->
    <div v-else class="hierarchy-container">
      <!-- All Orgs Mode: Group by Organization -->
      <template v-if="isAllOrgsMode">
        <div
          v-for="orgGroup in hierarchyGroupedByOrg"
          :key="orgGroup.orgSlug"
          class="org-section"
        >
          <!-- Organization Header -->
          <div class="org-header">
            <ion-icon :icon="getOrgIcon(orgGroup.orgSlug)" class="org-icon" />
            <span class="org-name">{{ orgGroup.orgName }}</span>
            <ion-badge
              v-if="!shouldHideOrgConversationCount(orgGroup)"
              color="medium"
              class="org-conversation-count"
            >
              {{ orgGroup.totalConversations }}
            </ion-badge>
          </div>

          <!-- CEO/Top Orchestrator within this org -->
          <div
            v-for="group in orgGroup.groups.filter((g) => g.isCEOAgent)"
            :key="group.type"
            class="agent-group org-nested"
          >
            <ion-accordion-group>
              <ion-accordion
                :value="
                  expandedAccordions.includes('ceo-' + orgGroup.orgSlug)
                    ? 'ceo-' + orgGroup.orgSlug
                    : undefined
                "
              >
                <!-- CEO as accordion header with action buttons -->
                <ion-item slot="header" class="ceo-header">
                  <ion-icon
                    :icon="icons.briefcaseOutline"
                    class="ceo-icon"
                    slot="start"
                  />
                  <ion-label>
                    <h3>{{ formatAgentDisplayName(group.agents[0], true) }}</h3>
                  </ion-label>
                  <ion-badge
                    v-if="!shouldHideGroupConversationCount(group)"
                    :color="group.totalConversations > 0 ? 'primary' : 'medium'"
                    class="ceo-conversation-count"
                  >
                    {{ group.totalConversations }}
                  </ion-badge>
                  <!-- Action buttons in header -->
                  <div class="header-actions" @click.stop>
                    <ion-button
                      fill="clear"
                      size="small"
                      @click="
                        startNewConversation(
                          group.agents[0],
                          'ceo-' + orgGroup.orgSlug,
                        )
                      "
                      title="Start new conversation"
                      class="header-action-btn"
                    >
                      <ion-icon :icon="icons.chatbubbleOutline" />
                    </ion-button>
                  </div>
                </ion-item>

                <!-- Accordion content: CEO's conversations -->
                <div slot="content" class="accordion-content">
                  <!-- CEO's Conversations (collapsible) -->
                  <div v-if="group.agents[0]" class="ceo-content">
                    <!-- Conversation list toggle header -->
                    <div
                      v-if="
                        group.agents[0].conversations &&
                        group.agents[0].conversations.length > 0
                      "
                      class="conversation-toggle-header"
                      @click="toggleConversationList(group.agents[0].name)"
                    >
                      <ion-icon
                        :icon="
                          isConversationListExpanded(group.agents[0].name)
                            ? icons.chevronDownOutline
                            : icons.chevronForwardOutline
                        "
                        class="toggle-chevron"
                      />
                      <span class="toggle-label">Conversations</span>
                      <ion-badge color="secondary" class="toggle-badge">
                        {{ group.agents[0].conversations.length }}
                      </ion-badge>
                    </div>
                    <!-- CEO's Conversations (collapsed by default) -->
                    <div
                      v-if="
                        isConversationListExpanded(group.agents[0].name) &&
                        group.agents[0].conversations &&
                        group.agents[0].conversations.length > 0
                      "
                      class="conversations-list"
                    >
                      <ion-item
                        v-for="conversation in group.agents[0].conversations"
                        :key="conversation.id"
                        @click="selectConversation(conversation)"
                        button
                        class="conversation-item ceo-conversation"
                      >
                        <ion-icon
                          :icon="icons.chatbubbleOutline"
                          slot="start"
                          color="secondary"
                        />
                        <ion-label>
                          <p>{{ formatConversationTitle(conversation) }}</p>
                        </ion-label>
                        <ion-badge
                          v-if="
                            conversation.activeTasks &&
                            conversation.activeTasks > 0
                          "
                          slot="end"
                          color="warning"
                        >
                          {{ conversation.activeTasks }}
                        </ion-badge>
                        <ion-button
                          fill="clear"
                          size="small"
                          color="danger"
                          slot="end"
                          @click="deleteConversation(conversation, $event)"
                        >
                          <ion-icon :icon="icons.trashOutline" />
                        </ion-button>
                      </ion-item>
                    </div>
                  </div>

                  <!-- Team Members (for orchestrator's direct agents, not managers) -->
                  <div v-if="group.agents.length > 1" class="team-members">
                    <h5 class="section-title">Team Members</h5>
                    <div
                      v-for="agent in group.agents.slice(1)"
                      :key="agent.name"
                      class="agent-section nested-agent"
                    >
                      <!-- Agent Row: Item box + external meta -->
                      <div class="agent-row">
                        <ion-item class="nested-agent-item">
                          <ion-icon
                            :icon="
                              agentShowsDashboard(agent)
                                ? icons.analyticsOutline
                                : icons.personOutline
                            "
                            slot="start"
                            color="tertiary"
                          />
                          <ion-label>
                            <h4>{{ formatAgentDisplayName(agent, false) }}</h4>
                          </ion-label>

                          <ion-badge
                            v-if="
                              agentShowsConversation(agent) &&
                              !shouldHideConversationCount(agent)
                            "
                            :color="
                              (agent.totalConversations || 0) > 0
                                ? 'secondary'
                                : 'light'
                            "
                            class="agent-badge"
                            slot="end"
                          >
                            {{ agent.totalConversations || 0 }}
                          </ion-badge>

                          <!-- Chat and Dashboard buttons stay inside the item -->
                          <ion-button
                            v-if="agentShowsConversation(agent)"
                            slot="end"
                            fill="clear"
                            size="small"
                            @click.stop="createNewConversation(agent)"
                            title="Start new conversation"
                            class="agent-action-btn"
                          >
                            <ion-icon :icon="icons.chatbubbleOutline" />
                          </ion-button>
                          <ion-button
                            v-if="agentShowsDashboard(agent)"
                            slot="end"
                            fill="clear"
                            size="small"
                            @click.stop="openAgentDashboard(agent)"
                            title="Open dashboard"
                            class="agent-action-btn"
                          >
                            <ion-icon
                              :icon="icons.gridOutline"
                              color="tertiary"
                            />
                          </ion-button>
                          <!-- Chevron button moved inside item -->
                          <ion-button
                            v-if="
                              agentShowsConversation(agent) &&
                              agent.conversations &&
                              agent.conversations.length > 0
                            "
                            slot="end"
                            fill="clear"
                            size="small"
                            @click.stop="toggleConversationList(agent.name)"
                            title="Toggle conversation list"
                            class="agent-action-btn"
                          >
                            <ion-icon
                              :icon="
                                isConversationListExpanded(agent.name)
                                  ? icons.chevronDownOutline
                                  : icons.chevronForwardOutline
                              "
                            />
                          </ion-button>
                        </ion-item>
                      </div>

                      <!-- Agent's Conversations (collapsed by default) - only for agents that support conversations -->
                      <div
                        v-if="
                          agentShowsConversation(agent) &&
                          isConversationListExpanded(agent.name) &&
                          agent.conversations &&
                          agent.conversations.length > 0
                        "
                        class="conversations-list"
                      >
                        <ion-item
                          v-for="conversation in agent.conversations"
                          :key="conversation.id"
                          button
                          @click="selectConversation(conversation)"
                          class="conversation-item"
                        >
                          <ion-icon
                            :icon="icons.chatbubbleOutline"
                            slot="start"
                            color="tertiary"
                          />
                          <ion-label>
                            <p>{{ formatConversationTitle(conversation) }}</p>
                          </ion-label>
                          <ion-badge
                            v-if="
                              conversation.activeTasks &&
                              conversation.activeTasks > 0
                            "
                            slot="end"
                            color="warning"
                          >
                            {{ conversation.activeTasks }}
                          </ion-badge>
                          <ion-button
                            fill="clear"
                            size="small"
                            color="danger"
                            slot="end"
                            @click="deleteConversation(conversation, $event)"
                          >
                            <ion-icon :icon="icons.trashOutline" />
                          </ion-button>
                        </ion-item>
                      </div>
                    </div>
                    <!-- End nested-agent -->
                  </div>
                  <!-- End team-members -->
                </div>
                <!-- End accordion-content -->
              </ion-accordion>
            </ion-accordion-group>
          </div>

          <!-- Managers within this org -->
          <div
            v-for="group in orgGroup.groups.filter(
              (g) => g.isManager && !g.isCEOAgent,
            )"
            :key="group.type"
            class="agent-group org-nested"
          >
            <ion-accordion-group>
              <ion-accordion
                :value="
                  expandedAccordions.includes(
                    group.type + '-' + orgGroup.orgSlug,
                  )
                    ? group.type + '-' + orgGroup.orgSlug
                    : undefined
                "
              >
                <!-- Manager as accordion header with action buttons -->
                <ion-item slot="header" class="manager-header">
                  <ion-icon
                    :icon="icons.briefcaseOutline"
                    class="manager-icon"
                    slot="start"
                  />
                  <ion-label>
                    <h3>{{ formatAgentDisplayName(group.agents[0], true) }}</h3>
                  </ion-label>
                  <ion-badge
                    v-if="!shouldHideGroupConversationCount(group)"
                    :color="
                      group.totalConversations > 0 ? 'tertiary' : 'medium'
                    "
                    class="manager-conversation-count"
                  >
                    {{ group.totalConversations }}
                  </ion-badge>
                  <!-- Action buttons in header -->
                  <div class="header-actions" @click.stop>
                    <ion-button
                      fill="clear"
                      size="small"
                      @click="
                        startNewConversation(
                          group.agents[0],
                          group.type + '-' + orgGroup.orgSlug,
                        )
                      "
                      title="Start new conversation"
                      class="header-action-btn"
                    >
                      <ion-icon :icon="icons.chatbubbleOutline" />
                    </ion-button>
                  </div>
                </ion-item>

                <!-- Accordion content: Manager's conversations first, then team members -->
                <div slot="content" class="accordion-content">
                  <!-- Manager's Conversations (first agent in the group, collapsible) -->
                  <div v-if="group.agents[0]" class="manager-content">
                    <!-- Conversation list toggle header -->
                    <div
                      v-if="
                        group.agents[0].conversations &&
                        group.agents[0].conversations.length > 0
                      "
                      class="conversation-toggle-header"
                      @click="toggleConversationList(group.agents[0].name)"
                    >
                      <ion-icon
                        :icon="
                          isConversationListExpanded(group.agents[0].name)
                            ? icons.chevronDownOutline
                            : icons.chevronForwardOutline
                        "
                        class="toggle-chevron"
                      />
                      <span class="toggle-label">Manager Conversations</span>
                      <ion-badge color="tertiary" class="toggle-badge">
                        {{ group.agents[0].conversations.length }}
                      </ion-badge>
                    </div>
                    <!-- Manager's Conversations (collapsed by default) -->
                    <div
                      v-if="
                        isConversationListExpanded(group.agents[0].name) &&
                        group.agents[0].conversations &&
                        group.agents[0].conversations.length > 0
                      "
                      class="conversations-list"
                    >
                      <ion-item
                        v-for="conversation in group.agents[0].conversations"
                        :key="conversation.id"
                        @click="selectConversation(conversation)"
                        button
                        class="conversation-item manager-conversation"
                      >
                        <ion-icon
                          :icon="icons.chatbubbleOutline"
                          slot="start"
                          color="secondary"
                        />
                        <ion-label>
                          <p>{{ formatConversationTitle(conversation) }}</p>
                        </ion-label>
                        <ion-badge
                          v-if="
                            conversation.activeTasks &&
                            conversation.activeTasks > 0
                          "
                          slot="end"
                          color="warning"
                        >
                          {{ conversation.activeTasks }}
                        </ion-badge>
                        <ion-button
                          fill="clear"
                          size="small"
                          color="danger"
                          slot="end"
                          @click="deleteConversation(conversation, $event)"
                        >
                          <ion-icon :icon="icons.trashOutline" />
                        </ion-button>
                      </ion-item>
                    </div>
                  </div>

                  <!-- Team Members -->
                  <div v-if="group.agents.length > 1" class="team-members">
                    <h5 class="section-title">Team Members</h5>
                    <div
                      v-for="agent in group.agents.slice(1)"
                      :key="agent.name"
                      class="agent-section nested-agent"
                    >
                      <!-- Agent Row: Item box + external meta -->
                      <div class="agent-row">
                        <ion-item class="nested-agent-item">
                          <ion-icon
                            :icon="
                              agentShowsDashboard(agent)
                                ? icons.analyticsOutline
                                : icons.personOutline
                            "
                            slot="start"
                            color="tertiary"
                          />
                          <ion-label>
                            <h4>{{ formatAgentDisplayName(agent, false) }}</h4>
                          </ion-label>

                          <ion-badge
                            v-if="
                              agentShowsConversation(agent) &&
                              !shouldHideConversationCount(agent)
                            "
                            :color="
                              (agent.totalConversations || 0) > 0
                                ? 'secondary'
                                : 'light'
                            "
                            class="agent-badge"
                            slot="end"
                          >
                            {{ agent.totalConversations || 0 }}
                          </ion-badge>

                          <!-- Chat and Dashboard buttons stay inside the item -->
                          <ion-button
                            v-if="agentShowsConversation(agent)"
                            slot="end"
                            fill="clear"
                            size="small"
                            @click.stop="createNewConversation(agent)"
                            title="Start new conversation"
                            class="agent-action-btn"
                          >
                            <ion-icon :icon="icons.chatbubbleOutline" />
                          </ion-button>
                          <ion-button
                            v-if="agentShowsDashboard(agent)"
                            slot="end"
                            fill="clear"
                            size="small"
                            @click.stop="openAgentDashboard(agent)"
                            title="Open dashboard"
                            class="agent-action-btn"
                          >
                            <ion-icon
                              :icon="icons.gridOutline"
                              color="tertiary"
                            />
                          </ion-button>
                          <!-- Chevron button moved inside item -->
                          <ion-button
                            v-if="
                              agentShowsConversation(agent) &&
                              agent.conversations &&
                              agent.conversations.length > 0
                            "
                            slot="end"
                            fill="clear"
                            size="small"
                            @click.stop="toggleConversationList(agent.name)"
                            title="Toggle conversation list"
                            class="agent-action-btn"
                          >
                            <ion-icon
                              :icon="
                                isConversationListExpanded(agent.name)
                                  ? icons.chevronDownOutline
                                  : icons.chevronForwardOutline
                              "
                            />
                          </ion-button>
                        </ion-item>
                      </div>

                      <!-- Agent's Conversations (collapsed by default) - only for agents that support conversations -->
                      <div
                        v-if="
                          agentShowsConversation(agent) &&
                          isConversationListExpanded(agent.name) &&
                          agent.conversations &&
                          agent.conversations.length > 0
                        "
                        class="conversations-list"
                      >
                        <ion-item
                          v-for="conversation in agent.conversations"
                          :key="conversation.id"
                          button
                          @click="selectConversation(conversation)"
                          class="conversation-item"
                        >
                          <ion-icon
                            :icon="icons.chatbubbleOutline"
                            slot="start"
                            color="tertiary"
                          />
                          <ion-label>
                            <p>{{ formatConversationTitle(conversation) }}</p>
                          </ion-label>
                          <ion-badge
                            v-if="
                              conversation.activeTasks &&
                              conversation.activeTasks > 0
                            "
                            slot="end"
                            color="warning"
                          >
                            {{ conversation.activeTasks }}
                          </ion-badge>
                          <ion-button
                            fill="clear"
                            size="small"
                            color="danger"
                            slot="end"
                            @click="deleteConversation(conversation, $event)"
                          >
                            <ion-icon :icon="icons.trashOutline" />
                          </ion-button>
                        </ion-item>
                      </div>
                    </div>
                    <!-- End nested-agent -->
                  </div>
                  <!-- End team-members -->
                </div>
                <!-- End accordion-content -->
              </ion-accordion>
            </ion-accordion-group>
          </div>

          <!-- Specialists within this org -->
          <div
            v-for="group in orgGroup.groups.filter((g) => g.isSpecialists)"
            :key="group.type"
            class="org-nested"
          >
            <div
              v-for="agent in group.agents"
              :key="agent.name"
              class="agent-section"
            >
              <!-- Agent Row: Item box + external meta -->
              <div class="agent-row">
                <ion-item class="specialist-item">
                  <ion-icon
                    :icon="
                      agentShowsDashboard(agent)
                        ? icons.analyticsOutline
                        : icons.personOutline
                    "
                    color="tertiary"
                    slot="start"
                  />
                  <ion-label>
                    <h3>{{ formatAgentDisplayName(agent, true) }}</h3>
                  </ion-label>

                  <ion-badge
                    v-if="
                      agentShowsConversation(agent) &&
                      !shouldHideConversationCount(agent)
                    "
                    :color="
                      (agent.totalConversations || 0) > 0 ? 'primary' : 'medium'
                    "
                    class="agent-badge"
                    slot="end"
                  >
                    {{ agent.totalConversations || 0 }}
                  </ion-badge>

                  <!-- Chat and Dashboard buttons stay inside the item -->
                  <ion-button
                    v-if="agentShowsConversation(agent)"
                    slot="end"
                    fill="clear"
                    size="small"
                    @click.stop="createNewConversation(agent)"
                    title="Start new conversation"
                    class="agent-action-btn"
                  >
                    <ion-icon :icon="icons.chatbubbleOutline" />
                  </ion-button>
                  <ion-button
                    v-if="agentShowsDashboard(agent)"
                    slot="end"
                    fill="clear"
                    size="small"
                    @click.stop="openAgentDashboard(agent)"
                    title="Open dashboard"
                    class="agent-action-btn"
                  >
                    <ion-icon :icon="icons.gridOutline" color="tertiary" />
                  </ion-button>
                  <!-- Chevron button moved inside item -->
                  <ion-button
                    v-if="
                      agentShowsConversation(agent) &&
                      agent.conversations &&
                      agent.conversations.length > 0
                    "
                    slot="end"
                    fill="clear"
                    size="small"
                    @click.stop="toggleConversationList(agent.name)"
                    title="Toggle conversation list"
                    class="agent-action-btn"
                  >
                    <ion-icon
                      :icon="
                        isConversationListExpanded(agent.name)
                          ? icons.chevronDownOutline
                          : icons.chevronForwardOutline
                      "
                    />
                  </ion-button>
                </ion-item>
              </div>

              <!-- Agent's Conversations (collapsed by default) - only for agents that support conversations -->
              <div
                v-if="
                  agentShowsConversation(agent) &&
                  isConversationListExpanded(agent.name) &&
                  agent.conversations &&
                  agent.conversations.length > 0
                "
                class="conversations-list"
              >
                <ion-item
                  v-for="conversation in agent.conversations"
                  :key="conversation.id"
                  button
                  @click="selectConversation(conversation)"
                  class="conversation-item"
                >
                  <ion-icon
                    :icon="icons.chatbubbleOutline"
                    slot="start"
                    color="tertiary"
                  />
                  <ion-label>
                    <p>{{ formatConversationTitle(conversation) }}</p>
                  </ion-label>
                  <ion-badge
                    v-if="
                      conversation.activeTasks && conversation.activeTasks > 0
                    "
                    slot="end"
                    color="warning"
                  >
                    {{ conversation.activeTasks }}
                  </ion-badge>
                  <ion-button
                    fill="clear"
                    size="small"
                    color="danger"
                    slot="end"
                    @click="deleteConversation(conversation, $event)"
                  >
                    <ion-icon :icon="icons.trashOutline" />
                  </ion-button>
                </ion-item>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Single Org Mode: Original Display (no org grouping) -->
      <template v-else>
        <!-- CEO as accordion (similar to managers) -->
        <div
          v-for="group in hierarchyGroups.filter((g) => g.isCEOAgent)"
          :key="group.type"
          class="agent-group"
        >
          <ion-accordion-group>
            <ion-accordion
              :value="expandedAccordions.includes('ceo') ? 'ceo' : undefined"
            >
              <!-- CEO as accordion header with action buttons -->
              <ion-item slot="header" class="ceo-header">
                <ion-icon
                  :icon="icons.briefcaseOutline"
                  class="ceo-icon"
                  slot="start"
                />
                <ion-label>
                  <h3>{{ formatAgentDisplayName(group.agents[0], true) }}</h3>
                </ion-label>
                <ion-badge
                  v-if="!shouldHideGroupConversationCount(group)"
                  :color="group.totalConversations > 0 ? 'primary' : 'medium'"
                  class="ceo-conversation-count"
                >
                  {{ group.totalConversations }}
                </ion-badge>
                <!-- Action buttons in header -->
                <div class="header-actions" @click.stop>
                  <ion-button
                    fill="clear"
                    size="small"
                    @click="startNewConversation(group.agents[0], 'ceo')"
                    title="Start new conversation"
                    class="header-action-btn"
                  >
                    <ion-icon :icon="icons.chatbubbleOutline" />
                  </ion-button>
                </div>
              </ion-item>

              <!-- Accordion content: CEO's conversations -->
              <div slot="content" class="accordion-content">
                <!-- CEO's Conversations (collapsible) -->
                <div v-if="group.agents[0]" class="ceo-content">
                  <!-- Conversation list toggle header -->
                  <div
                    v-if="
                      group.agents[0].conversations &&
                      group.agents[0].conversations.length > 0
                    "
                    class="conversation-toggle-header"
                    @click="toggleConversationList(group.agents[0].name)"
                  >
                    <ion-icon
                      :icon="
                        isConversationListExpanded(group.agents[0].name)
                          ? icons.chevronDownOutline
                          : icons.chevronForwardOutline
                      "
                      class="toggle-chevron"
                    />
                    <span class="toggle-label">Conversations</span>
                    <ion-badge color="secondary" class="toggle-badge">
                      {{ group.agents[0].conversations.length }}
                    </ion-badge>
                  </div>
                  <!-- CEO's Conversations (collapsed by default) -->
                  <div
                    v-if="
                      isConversationListExpanded(group.agents[0].name) &&
                      group.agents[0].conversations &&
                      group.agents[0].conversations.length > 0
                    "
                    class="conversations-list"
                  >
                    <ion-item
                      v-for="conversation in group.agents[0].conversations"
                      :key="conversation.id"
                      @click="selectConversation(conversation)"
                      button
                      class="conversation-item ceo-conversation"
                    >
                      <ion-icon
                        :icon="icons.chatbubbleOutline"
                        slot="start"
                        color="secondary"
                      />
                      <ion-label>
                        <p>{{ formatConversationTitle(conversation) }}</p>
                      </ion-label>
                      <ion-badge
                        v-if="
                          conversation.activeTasks &&
                          conversation.activeTasks > 0
                        "
                        slot="end"
                        color="warning"
                      >
                        {{ conversation.activeTasks }}
                      </ion-badge>
                      <ion-button
                        fill="clear"
                        size="small"
                        color="danger"
                        slot="end"
                        @click="deleteConversation(conversation, $event)"
                      >
                        <ion-icon :icon="icons.trashOutline" />
                      </ion-button>
                    </ion-item>
                  </div>
                </div>

                <!-- Team Members (for orchestrator's direct agents, not managers) -->
                <div v-if="group.agents.length > 1" class="team-members">
                  <h5 class="section-title">Team Members</h5>
                  <div
                    v-for="agent in group.agents.slice(1)"
                    :key="agent.name"
                    class="agent-section nested-agent"
                  >
                    <!-- Agent Row: Item box + external meta -->
                    <div class="agent-row">
                      <ion-item class="nested-agent-item">
                        <ion-icon
                          :icon="
                            agentShowsDashboard(agent)
                              ? icons.analyticsOutline
                              : icons.personOutline
                          "
                          slot="start"
                          color="tertiary"
                        />
                        <ion-label>
                          <h4>{{ formatAgentDisplayName(agent, false) }}</h4>
                        </ion-label>
                        <!-- Chat and Dashboard buttons stay inside the item -->
                        <ion-button
                          v-if="agentShowsConversation(agent)"
                          slot="end"
                          fill="clear"
                          size="small"
                          @click.stop="createNewConversation(agent)"
                          title="Start new conversation"
                          class="agent-action-btn"
                        >
                          <ion-icon :icon="icons.chatbubbleOutline" />
                        </ion-button>
                        <ion-button
                          v-if="agentShowsDashboard(agent)"
                          slot="end"
                          fill="clear"
                          size="small"
                          @click.stop="openAgentDashboard(agent)"
                          title="Open dashboard"
                          class="agent-action-btn"
                        >
                          <ion-icon
                            :icon="icons.gridOutline"
                            color="tertiary"
                          />
                        </ion-button>

                        <ion-badge
                          v-if="
                            agentShowsConversation(agent) &&
                            !shouldHideConversationCount(agent)
                          "
                          :color="
                            (agent.totalConversations || 0) > 0
                              ? 'secondary'
                              : 'light'
                          "
                          class="agent-badge"
                          slot="end"
                        >
                          {{ agent.totalConversations || 0 }}
                        </ion-badge>

                        <ion-button
                          v-if="
                            agentShowsConversation(agent) &&
                            agent.conversations &&
                            agent.conversations.length > 0
                          "
                          slot="end"
                          fill="clear"
                          size="small"
                          @click.stop="toggleConversationList(agent.name)"
                          title="Toggle conversation list"
                          class="agent-action-btn"
                        >
                          <ion-icon
                            :icon="
                              isConversationListExpanded(agent.name)
                                ? icons.chevronDownOutline
                                : icons.chevronForwardOutline
                            "
                          />
                        </ion-button>
                      </ion-item>
                    </div>

                    <!-- Agent's Conversations (collapsed by default) - only for agents that support conversations -->
                    <div
                      v-if="
                        agentShowsConversation(agent) &&
                        isConversationListExpanded(agent.name) &&
                        agent.conversations &&
                        agent.conversations.length > 0
                      "
                      class="conversations-list"
                    >
                      <ion-item
                        v-for="conversation in agent.conversations"
                        :key="conversation.id"
                        button
                        @click="selectConversation(conversation)"
                        class="conversation-item"
                      >
                        <ion-icon
                          :icon="icons.chatbubbleOutline"
                          slot="start"
                          color="tertiary"
                        />
                        <ion-label>
                          <p>{{ formatConversationTitle(conversation) }}</p>
                        </ion-label>
                        <ion-badge
                          v-if="
                            conversation.activeTasks &&
                            conversation.activeTasks > 0
                          "
                          slot="end"
                          color="warning"
                        >
                          {{ conversation.activeTasks }}
                        </ion-badge>
                        <ion-button
                          fill="clear"
                          size="small"
                          color="danger"
                          slot="end"
                          @click="deleteConversation(conversation, $event)"
                        >
                          <ion-icon :icon="icons.trashOutline" />
                        </ion-button>
                      </ion-item>
                    </div>
                  </div>
                  <!-- End nested-agent -->
                </div>
                <!-- End team-members -->
              </div>
              <!-- End accordion-content -->
            </ion-accordion>
          </ion-accordion-group>
        </div>

        <!-- Managers as accordions -->
        <div
          v-for="group in hierarchyGroups.filter(
            (g) => g.isManager && !g.isCEOAgent,
          )"
          :key="group.type"
          class="agent-group"
        >
          <ion-accordion-group>
            <ion-accordion
              :value="
                expandedAccordions.includes(group.type) ? group.type : undefined
              "
            >
              <!-- Manager as accordion header with action buttons -->
              <ion-item slot="header" class="manager-header">
                <ion-icon
                  :icon="icons.briefcaseOutline"
                  class="manager-icon"
                  slot="start"
                />
                <ion-label>
                  <h3>{{ formatAgentDisplayName(group.agents[0], true) }}</h3>
                </ion-label>
                <ion-badge
                  v-if="!shouldHideGroupConversationCount(group)"
                  :color="group.totalConversations > 0 ? 'tertiary' : 'medium'"
                  class="manager-conversation-count"
                >
                  {{ group.totalConversations }}
                </ion-badge>
                <!-- Action buttons in header -->
                <div class="header-actions" @click.stop>
                  <ion-button
                    fill="clear"
                    size="small"
                    @click="startNewConversation(group.agents[0], group.type)"
                    title="Start new conversation"
                    class="header-action-btn"
                  >
                    <ion-icon :icon="icons.chatbubbleOutline" />
                  </ion-button>
                </div>
              </ion-item>

              <!-- Accordion content: Manager's conversations first, then team members -->
              <div slot="content" class="accordion-content">
                <!-- Manager's Conversations (first agent in the group, collapsible) -->
                <div v-if="group.agents[0]" class="manager-content">
                  <!-- Conversation list toggle header -->
                  <div
                    v-if="
                      group.agents[0].conversations &&
                      group.agents[0].conversations.length > 0
                    "
                    class="conversation-toggle-header"
                    @click="toggleConversationList(group.agents[0].name)"
                  >
                    <ion-icon
                      :icon="
                        isConversationListExpanded(group.agents[0].name)
                          ? icons.chevronDownOutline
                          : icons.chevronForwardOutline
                      "
                      class="toggle-chevron"
                    />
                    <span class="toggle-label">Manager Conversations</span>
                    <ion-badge color="tertiary" class="toggle-badge">
                      {{ group.agents[0].conversations.length }}
                    </ion-badge>
                  </div>
                  <!-- Manager's Conversations (collapsed by default) -->
                  <div
                    v-if="
                      isConversationListExpanded(group.agents[0].name) &&
                      group.agents[0].conversations &&
                      group.agents[0].conversations.length > 0
                    "
                    class="conversations-list"
                  >
                    <ion-item
                      v-for="conversation in group.agents[0].conversations"
                      :key="conversation.id"
                      @click="selectConversation(conversation)"
                      button
                      class="conversation-item manager-conversation"
                    >
                      <ion-icon
                        :icon="icons.chatbubbleOutline"
                        slot="start"
                        color="secondary"
                      />
                      <ion-label>
                        <p>{{ formatConversationTitle(conversation) }}</p>
                      </ion-label>
                      <ion-badge
                        v-if="
                          conversation.activeTasks &&
                          conversation.activeTasks > 0
                        "
                        slot="end"
                        color="warning"
                      >
                        {{ conversation.activeTasks }}
                      </ion-badge>
                      <ion-button
                        fill="clear"
                        size="small"
                        color="danger"
                        slot="end"
                        @click="deleteConversation(conversation, $event)"
                      >
                        <ion-icon :icon="icons.trashOutline" />
                      </ion-button>
                    </ion-item>
                  </div>
                </div>

                <!-- Team Members -->
                <div v-if="group.agents.length > 1" class="team-members">
                  <h5 class="section-title">Team Members</h5>
                  <div
                    v-for="agent in group.agents.slice(1)"
                    :key="agent.name"
                    class="agent-section nested-agent"
                  >
                    <!-- Agent Row: Item box + external meta -->
                    <div class="agent-row">
                      <ion-item class="nested-agent-item">
                        <ion-icon
                          :icon="
                            agentShowsDashboard(agent)
                              ? icons.analyticsOutline
                              : icons.personOutline
                          "
                          slot="start"
                          color="tertiary"
                        />
                        <ion-label>
                          <h4>{{ formatAgentDisplayName(agent, false) }}</h4>
                        </ion-label>
                        <!-- Chat and Dashboard buttons stay inside the item -->
                        <ion-button
                          v-if="agentShowsConversation(agent)"
                          slot="end"
                          fill="clear"
                          size="small"
                          @click.stop="createNewConversation(agent)"
                          title="Start new conversation"
                          class="agent-action-btn"
                        >
                          <ion-icon :icon="icons.chatbubbleOutline" />
                        </ion-button>
                        <ion-button
                          v-if="agentShowsDashboard(agent)"
                          slot="end"
                          fill="clear"
                          size="small"
                          @click.stop="openAgentDashboard(agent)"
                          title="Open dashboard"
                          class="agent-action-btn"
                        >
                          <ion-icon
                            :icon="icons.gridOutline"
                            color="tertiary"
                          />
                        </ion-button>

                        <ion-badge
                          v-if="
                            agentShowsConversation(agent) &&
                            !shouldHideConversationCount(agent)
                          "
                          :color="
                            (agent.totalConversations || 0) > 0
                              ? 'secondary'
                              : 'light'
                          "
                          class="agent-badge"
                          slot="end"
                        >
                          {{ agent.totalConversations || 0 }}
                        </ion-badge>

                        <ion-button
                          v-if="
                            agentShowsConversation(agent) &&
                            agent.conversations &&
                            agent.conversations.length > 0
                          "
                          slot="end"
                          fill="clear"
                          size="small"
                          @click.stop="toggleConversationList(agent.name)"
                          title="Toggle conversation list"
                          class="agent-action-btn"
                        >
                          <ion-icon
                            :icon="
                              isConversationListExpanded(agent.name)
                                ? icons.chevronDownOutline
                                : icons.chevronForwardOutline
                            "
                          />
                        </ion-button>
                      </ion-item>
                    </div>

                    <!-- Agent's Conversations (collapsed by default) - only for agents that support conversations -->
                    <div
                      v-if="
                        agentShowsConversation(agent) &&
                        isConversationListExpanded(agent.name) &&
                        agent.conversations &&
                        agent.conversations.length > 0
                      "
                      class="conversations-list"
                    >
                      <ion-item
                        v-for="conversation in agent.conversations"
                        :key="conversation.id"
                        button
                        @click="selectConversation(conversation)"
                        class="conversation-item"
                      >
                        <ion-icon
                          :icon="icons.chatbubbleOutline"
                          slot="start"
                          color="tertiary"
                        />
                        <ion-label>
                          <p>{{ formatConversationTitle(conversation) }}</p>
                        </ion-label>
                        <ion-badge
                          v-if="
                            conversation.activeTasks &&
                            conversation.activeTasks > 0
                          "
                          slot="end"
                          color="warning"
                        >
                          {{ conversation.activeTasks }}
                        </ion-badge>
                        <ion-button
                          fill="clear"
                          size="small"
                          color="danger"
                          slot="end"
                          @click="deleteConversation(conversation, $event)"
                        >
                          <ion-icon :icon="icons.trashOutline" />
                        </ion-button>
                      </ion-item>
                    </div>
                  </div>
                  <!-- End nested-agent -->
                </div>
                <!-- End team-members -->
              </div>
              <!-- End accordion-content -->
            </ion-accordion>
          </ion-accordion-group>
        </div>

        <!-- Specialists as individual agents (no grouping) -->
        <div
          v-for="group in hierarchyGroups.filter((g) => g.isSpecialists)"
          :key="group.type"
        >
          <div
            v-for="agent in group.agents"
            :key="agent.name"
            class="agent-section"
          >
            <!-- Agent Row: Item box + external meta -->
            <div class="agent-row">
              <ion-item class="specialist-item">
                <ion-icon
                  :icon="
                    agentShowsDashboard(agent)
                      ? icons.analyticsOutline
                      : icons.personOutline
                  "
                  color="tertiary"
                  slot="start"
                />
                <ion-label>
                  <h3>{{ formatAgentDisplayName(agent, true) }}</h3>
                </ion-label>

                <ion-badge
                  v-if="
                    agentShowsConversation(agent) &&
                    !shouldHideConversationCount(agent)
                  "
                  :color="
                    (agent.totalConversations || 0) > 0 ? 'primary' : 'medium'
                  "
                  class="agent-badge"
                  slot="end"
                >
                  {{ agent.totalConversations || 0 }}
                </ion-badge>

                <!-- Chat and Dashboard buttons stay inside the item -->
                <ion-button
                  v-if="agentShowsConversation(agent)"
                  slot="end"
                  fill="clear"
                  size="small"
                  @click.stop="createNewConversation(agent)"
                  title="Start new conversation"
                  class="agent-action-btn"
                >
                  <ion-icon :icon="icons.chatbubbleOutline" />
                </ion-button>
                <ion-button
                  v-if="agentShowsDashboard(agent)"
                  slot="end"
                  fill="clear"
                  size="small"
                  @click.stop="openAgentDashboard(agent)"
                  title="Open dashboard"
                  class="agent-action-btn"
                >
                  <ion-icon :icon="icons.gridOutline" color="tertiary" />
                </ion-button>
                <!-- Chevron button moved inside item -->
                <ion-button
                  v-if="
                    agentShowsConversation(agent) &&
                    agent.conversations &&
                    agent.conversations.length > 0
                  "
                  slot="end"
                  fill="clear"
                  size="small"
                  @click.stop="toggleConversationList(agent.name)"
                  title="Toggle conversation list"
                  class="agent-action-btn"
                >
                  <ion-icon
                    :icon="
                      isConversationListExpanded(agent.name)
                        ? icons.chevronDownOutline
                        : icons.chevronForwardOutline
                    "
                  />
                </ion-button>
              </ion-item>
            </div>

            <!-- Agent's Conversations (collapsed by default) - only for agents that support conversations -->
            <div
              v-if="
                agentShowsConversation(agent) &&
                isConversationListExpanded(agent.name) &&
                agent.conversations &&
                agent.conversations.length > 0
              "
              class="conversations-list"
            >
              <ion-item
                v-for="conversation in agent.conversations"
                :key="conversation.id"
                button
                @click="selectConversation(conversation)"
                class="conversation-item"
              >
                <ion-icon
                  :icon="icons.chatbubbleOutline"
                  slot="start"
                  color="tertiary"
                />
                <ion-label>
                  <p>{{ formatConversationTitle(conversation) }}</p>
                </ion-label>
                <ion-badge
                  v-if="
                    conversation.activeTasks && conversation.activeTasks > 0
                  "
                  slot="end"
                  color="warning"
                >
                  {{ conversation.activeTasks }}
                </ion-badge>
                <ion-button
                  fill="clear"
                  size="small"
                  color="danger"
                  slot="end"
                  @click="deleteConversation(conversation, $event)"
                >
                  <ion-icon :icon="icons.trashOutline" />
                </ion-button>
              </ion-item>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Conversation Delete Modal -->
  <ConversationDeleteModal
    :is-open="showDeleteModal"
    :agent-display-name="conversationToDelete?.agentName || 'Unknown Agent'"
    :active-tasks="conversationToDelete?.activeTasks || 0"
    :has-deliverables="conversationToDelete?.hasDeliverables || false"
    @cancel="handleDeleteCancel"
    @confirm="handleDeleteConfirm"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import {
  IonSearchbar,
  IonButton,
  IonIcon,
  IonSpinner,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
  IonBadge,
} from "@ionic/vue";
import {
  personOutline,
  refreshOutline,
  alertCircleOutline,
  addOutline,
  folderOutline,
  briefcaseOutline,
  chatbubbleOutline,
  trashOutline,
  chevronDownOutline,
  chevronForwardOutline,
  gridOutline,
  analyticsOutline,
  businessOutline,
  codeSlashOutline,
  cashOutline,
  scaleOutline,
  megaphoneOutline,
  cogOutline,
  peopleOutline,
  ribbonOutline,
  rocketOutline,
  shieldOutline,
  storefrontOutline,
  constructOutline,
  bulbOutline,
  globeOutline,
} from "ionicons/icons";
import { formatAgentName } from "@/utils/caseConverter";
import {
  getInteractionMode,
  shouldShowDashboardIcon,
  shouldShowConversationIcon,
  isPredictionAgent as _isPredictionAgent,
  getDashboardComponent,
  isDashboardOnlyAgent,
  type InteractionModeConfig,
  type Agent as InteractionAgent,
} from "@/utils/agent-interaction-mode";
import { storeToRefs } from "pinia";
import { useAgentsStore } from "@/stores/agentsStore";
import { useConversationsStore } from "@/stores/conversationsStore";
import { useDeliverablesStore } from "@/stores/deliverablesStore";
import { getDeliverablesService } from "@/services/deliverablesService.impl";
import { conversationsService } from "@/services/conversationsService";
import { agentsService } from "@/services/agentsService";
import { useAuthStore } from "@/stores/rbacStore";
import ConversationDeleteModal from "./ConversationDeleteModal.vue";
import type {
  Agent,
  AgentConversation,
  AgentExecutionProfile,
  AgentExecutionCapabilities,
} from "@/types/conversation";
import type { HierarchyNode, AgentHierarchyResponse } from "@/types/agent";
import type { AgentType } from "@/stores/conversationsStore";

// Extended metadata type for execution properties
interface ExtendedMetadata {
  displayName?: string;
  description?: string;
  execution_modes?: string[];
  execution_profile?: AgentExecutionProfile;
  execution_capabilities?: AgentExecutionCapabilities;
  custom?: Record<string, string | number | boolean>;
}

// Extended conversation with agentName property
interface ConversationWithAgent extends AgentConversation {
  agentName?: string;
}

// Extended types for this component
interface EnhancedAgent extends Agent {
  displayName?: string;
  metadata?: {
    displayName?: string;
    description?: string;
    hasCustomUI?: boolean;
    customUIComponent?: string | null;
    execution_modes?: string[];
    execution_profile?: AgentExecutionProfile;
    execution_capabilities?: AgentExecutionCapabilities;
    custom?: Record<string, string | number | boolean>;
  };
  agentType?: string;
  children?: HierarchyNode[];
  conversations?: ExtendedConversation[];
  activeConversations?: number;
  totalConversations?: number;
}

interface ExtendedConversation extends AgentConversation {
  agentName?: string;
  activeTasks?: number;
  hasDeliverables?: boolean;
  endedAt?: Date | null;
}

interface HierarchyGroup {
  type: string;
  agents: EnhancedAgent[];
  totalConversations: number;
  isManager?: boolean;
  isCEO?: boolean;
  isCEOAgent?: boolean;
  isSpecialists?: boolean;
}

// Props
const props = defineProps<{
  compactMode?: boolean;
  searchQuery?: string;
}>();

// Emits
const emit = defineEmits<{
  "agent-selected": [agent: Agent];
  "conversation-selected": [conversation: AgentConversation];
  "open-dashboard": [agent: Agent, componentName: string];
}>();

// Reactive state
const searchQuery = ref(props.searchQuery || "");
const expandedAccordions = ref<string[]>([]);
// Track which agents have their conversation list expanded (collapsed by default)
const expandedConversationLists = ref<Set<string>>(new Set());

// Delete modal state
const showDeleteModal = ref(false);
const conversationToDelete = ref<ExtendedConversation | null>(null);

// Icons (make them reactive for template access)
const icons = {
  personOutline,
  refreshOutline,
  alertCircleOutline,
  addOutline,
  folderOutline,
  briefcaseOutline,
  chatbubbleOutline,
  trashOutline,
  chevronDownOutline,
  chevronForwardOutline,
  gridOutline,
  analyticsOutline,
  businessOutline,
  codeSlashOutline,
  cashOutline,
  scaleOutline,
  megaphoneOutline,
  cogOutline,
  peopleOutline,
  ribbonOutline,
  rocketOutline,
  shieldOutline,
  storefrontOutline,
  constructOutline,
  bulbOutline,
  globeOutline,
};

// Get icon for organization based on slug
const getOrgIcon = (orgSlug: string): string => {
  const iconMap: Record<string, string> = {
    engineering: codeSlashOutline,
    finance: cashOutline,
    legal: scaleOutline,
    marketing: megaphoneOutline,
    operations: cogOutline,
    hr: peopleOutline,
    "human-resources": peopleOutline,
    sales: storefrontOutline,
    product: rocketOutline,
    security: shieldOutline,
    it: constructOutline,
    research: bulbOutline,
    global: globeOutline,
    unassigned: businessOutline,
  };
  return iconMap[orgSlug.toLowerCase()] || businessOutline;
};

// Stores
const agentsStore = useAgentsStore();
const { agentHierarchy, isLoading, error } = storeToRefs(agentsStore);
const conversationsStore = useConversationsStore();
const deliverablesStore = useDeliverablesStore();
const authStore = useAuthStore();

// Convert conversations Map to array for easier filtering
const storeConversations = computed(() =>
  Array.from(conversationsStore.conversations.values()),
);

// Helper functions (defined before computed properties)
const formatAgentDisplayName = (
  agent: EnhancedAgent,
  removeOrchestrator = false,
) => {
  // If displayName exists and is different from name, use it as-is
  if (agent.displayName && agent.displayName !== agent.name) {
    return agent.displayName;
  }
  // Otherwise format the name
  let formatted = formatAgentName(agent.name);
  // Remove "Orchestrator" suffix for managers if requested
  if (removeOrchestrator) {
    formatted = formatted
      .replace(" Manager Orchestrator", " Manager")
      .replace(" Orchestrator", "");
  }
  return formatted;
};

const formatConversationTitle = (conversation: ExtendedConversation) => {
  // Just show relative time, not agent name
  return formatLastActive(conversation.lastActiveAt || conversation.createdAt);
};

const formatLastActive = (date: Date | string) => {
  const now = new Date();
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 minute";
  if (diffMins < 60) return `${diffMins} minutes`;
  if (diffHours === 1) return "1 hour";
  if (diffHours < 24) return `${diffHours} hours`;
  if (diffDays === 1) return "1 day";
  if (diffDays < 7) return `${diffDays} days`;
  return dateObj.toLocaleDateString();
};

const selectConversation = (conversation: ExtendedConversation) => {
  emit("conversation-selected", conversation);
};

// Toggle conversation list expansion for an agent
const toggleConversationList = (agentName: string) => {
  if (expandedConversationLists.value.has(agentName)) {
    expandedConversationLists.value.delete(agentName);
  } else {
    expandedConversationLists.value.add(agentName);
  }
  // Force reactivity update
  expandedConversationLists.value = new Set(expandedConversationLists.value);
};

// Check if an agent's conversation list is expanded
const isConversationListExpanded = (agentName: string): boolean => {
  return expandedConversationLists.value.has(agentName);
};

const deleteConversation = async (
  conversation: ExtendedConversation,
  event: Event,
) => {
  // Prevent the conversation selection when clicking delete
  event.stopPropagation();

  // Check if conversation has deliverables before showing modal
  let hasDeliverables = false;
  try {
    const deliverables = await getDeliverablesService().getConversationDeliverables(
      conversation.id,
    );
    deliverables.forEach((d) => {
      deliverablesStore.addDeliverable(d);
    });
    hasDeliverables = deliverables && deliverables.length > 0;
  } catch {
    // Default to false if we can't check
    hasDeliverables = false;
  }

  // Show the delete modal with deliverable information
  conversationToDelete.value = {
    ...conversation,
    hasDeliverables,
  };
  showDeleteModal.value = true;
};

const handleDeleteCancel = () => {
  showDeleteModal.value = false;
  conversationToDelete.value = null;
};

const handleDeleteConfirm = async (deleteDeliverables: boolean) => {
  try {
    if (!conversationToDelete.value) {
      return;
    }

    const conversation = conversationToDelete.value;

    // Close modal first
    showDeleteModal.value = false;

    // Delete deliverables if requested
    if (deleteDeliverables && conversationToDelete.value.hasDeliverables) {
      try {
        const deliverables =
          await getDeliverablesService().getConversationDeliverables(
            conversation.id,
          );
        for (const deliverable of deliverables) {
          await getDeliverablesService().deleteDeliverable(deliverable.id);
        }
      } catch {
        // Continue with conversation deletion even if deliverable deletion fails
      }
    }

    // Use service method - this will update the UI reactively and handle tab closure
    await conversationsService.deleteConversation(conversation.id);
  } catch (err) {
    console.error("Failed to delete conversation:", err);
    // Error is already handled in the service
  } finally {
    conversationToDelete.value = null;
  }
};

// Look up llm_config from the flat agents list (which includes it from the API)
const getLlmConfig = (agentName: string) => {
  const flatAgent = agentsStore.availableAgents.find(
    (a) => a.name === agentName || a.id === agentName,
  );
  return flatAgent?.llm_config ?? null;
};

// Simple hierarchy processing - just build the tree as it comes from the backend
const hierarchyGroups = computed(() => {
  const hierarchy = agentHierarchy.value;
  if (!hierarchy) return [];

  // The store already normalized the data to a flat array
  // hierarchy can be either an array or an object with data property
  const flatAgents = Array.isArray(hierarchy)
    ? hierarchy
    : (hierarchy as AgentHierarchyResponse).data
      ? ((hierarchy as AgentHierarchyResponse).data as HierarchyNode[])
      : [];

  const groups: HierarchyGroup[] = [];

  const processNode = (node: HierarchyNode) => {
    // Apply search filter to the manager/orchestrator
    const matchesSearch =
      !searchQuery.value ||
      node.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      node.metadata?.displayName
        ?.toLowerCase()
        .includes(searchQuery.value.toLowerCase()) ||
      node.metadata?.description
        ?.toLowerCase()
        .includes(searchQuery.value.toLowerCase());

    // Check if any children match the search
    let hasMatchingChildren = false;
    if (node.children) {
      hasMatchingChildren = node.children.some(
        (child: HierarchyNode) =>
          !searchQuery.value ||
          child.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          child.metadata?.displayName
            ?.toLowerCase()
            .includes(searchQuery.value.toLowerCase()) ||
          child.metadata?.description
            ?.toLowerCase()
            .includes(searchQuery.value.toLowerCase()),
      );
    }

    // Skip if neither the node nor its children match the search
    if (!matchesSearch && !hasMatchingChildren) return;

    // Get conversations for this manager/orchestrator
    // All agents now filter by organizationSlug
    // Use the store's conversationsByAgent method which handles organizationSlug matching properly
    const nodeConversations = conversationsStore.conversationsByAgent(
      node.name,
      node.organizationSlug || null,
    ) as ExtendedConversation[];

    // Create the manager/orchestrator agent
    const nodeMetadata = node.metadata as ExtendedMetadata | undefined;
    const mainAgent: EnhancedAgent = {
      name: node.name,
      type: node.agentType || "unknown",
      displayName: node.metadata?.displayName || node.name,
      description: node.metadata?.description || "",
      execution_modes: nodeMetadata?.execution_modes || [],
      execution_profile: nodeMetadata?.execution_profile,
      execution_capabilities: nodeMetadata?.execution_capabilities,
      llm_config: getLlmConfig(node.name),
      metadata: {
        displayName: node.metadata?.displayName,
        description: node.metadata?.description,
        hasCustomUI: (node.metadata?.custom?.hasCustomUI as boolean) || false,
        customUIComponent:
          (node.metadata?.custom?.customUIComponent as string) || null,
        execution_modes: nodeMetadata?.execution_modes,
        execution_profile: nodeMetadata?.execution_profile,
        execution_capabilities: nodeMetadata?.execution_capabilities,
        custom: nodeMetadata?.custom,
      },
      organizationSlug: node.organizationSlug,
      conversations: nodeConversations,
      activeConversations: nodeConversations.filter(
        (c: ExtendedConversation) => !c.endedAt,
      ).length,
      totalConversations: nodeConversations.length,
    };

    // Build the agents array - manager first, then direct children only
    const agents: EnhancedAgent[] = [mainAgent];

    // Add direct child agents (not their sub-children)
    if (node.children && node.children.length > 0) {
      node.children.forEach((child: HierarchyNode) => {
        // Check if this direct child matches the search
        const childMatchesSearch =
          !searchQuery.value ||
          child.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          child.metadata?.displayName
            ?.toLowerCase()
            .includes(searchQuery.value.toLowerCase()) ||
          child.metadata?.description
            ?.toLowerCase()
            .includes(searchQuery.value.toLowerCase());

        if (childMatchesSearch) {
          // All agents now filter by organizationSlug
          // Use the store's conversationsByAgent method which handles organizationSlug matching properly
          const childConversations = conversationsStore.conversationsByAgent(
            child.name,
            child.organizationSlug || null,
          ) as ExtendedConversation[];

          const childMetadata = child.metadata as ExtendedMetadata | undefined;
          agents.push({
            name: child.name,
            type: child.agentType || "unknown",
            displayName: child.metadata?.displayName || child.name,
            description: child.metadata?.description || "",
            execution_modes: childMetadata?.execution_modes || [],
            execution_profile: childMetadata?.execution_profile,
            execution_capabilities: childMetadata?.execution_capabilities,
            llm_config: getLlmConfig(child.name),
            metadata: {
              displayName: child.metadata?.displayName,
              description: child.metadata?.description,
              hasCustomUI:
                (child.metadata?.custom?.hasCustomUI as boolean) || false,
              customUIComponent:
                (child.metadata?.custom?.customUIComponent as string) || null,
              execution_modes: childMetadata?.execution_modes,
              execution_profile: childMetadata?.execution_profile,
              execution_capabilities: childMetadata?.execution_capabilities,
              custom: childMetadata?.custom,
            },
            organizationSlug: child.organizationSlug,
            conversations: childConversations,
            activeConversations: childConversations.filter(
              (c: ExtendedConversation) => !c.endedAt,
            ).length,
            totalConversations: childConversations.length,
          });
        }

        // If this child has its own children (is a sub-manager), process it separately
        if (child.children && child.children.length > 0) {
          processNode(child);
        }
      });
    }

    // Only create a group if we have agents to show
    if (agents.length > 0) {
      // Sort agents: dashboard agents first, then regular agents
      // Dashboard agents: legal-department, marketing-swarm
      const DASHBOARD_AGENTS = ["legal-department", "marketing-swarm", "cad-agent"];
      agents.sort((a, b) => {
        const aName = (a.name || "").toLowerCase().replace(/[-_\s]/g, "-");
        const bName = (b.name || "").toLowerCase().replace(/[-_\s]/g, "-");
        const aIsDashboard = DASHBOARD_AGENTS.includes(aName);
        const bIsDashboard = DASHBOARD_AGENTS.includes(bName);

        // Put dashboard agents first
        if (aIsDashboard && !bIsDashboard) return -1;
        if (!aIsDashboard && bIsDashboard) return 1;

        // Within same group, sort alphabetically
        return aName.localeCompare(bName);
      });

      // Update the main agent's (orchestrator's) conversation count to include all child conversations
      if (agents.length > 1) {
        // Only if there are child agents
        const totalChildConversations = agents
          .slice(1)
          .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
          .reduce((sum, a) => sum + (a.totalConversations || 0), 0);
        mainAgent.totalConversations =
          nodeConversations.length + totalChildConversations;
        mainAgent.activeConversations =
          nodeConversations.filter((c: ExtendedConversation) => !c.endedAt)
            .length +
          agents
            .slice(1)
            .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
            .reduce((sum, a) => sum + (a.activeConversations || 0), 0);
      }

      // Determine if this is a manager (has children or name indicates it)
      const isManager =
        (node.children && node.children.length > 0) ||
        node.name.toLowerCase().includes("manager") ||
        node.name.toLowerCase().includes("orchestrator");

      groups.push({
        type: node.name,
        agents: agents,
        totalConversations: agents
          .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
          .reduce((sum, a) => sum + (a.totalConversations || 0), 0),
        isManager: isManager,
        isCEO: false, // Set in the top orchestrator logic instead
      });
    }
  };

  // First, find the top-level orchestrator (could be CEO, Hiverarchy, etc.)
  // Take the first root node that has children as the main orchestrator
  const topOrchestrator = flatAgents.find(
    (agent: HierarchyNode) => agent.children && agent.children.length > 0,
  ); // Only find orchestrators that actually have children - no fallback

  if (
    topOrchestrator &&
    topOrchestrator.children &&
    topOrchestrator.children.length > 0
  ) {
    // For database orchestrators (with organizationSlug), match by organizationSlug; otherwise match by agentType
    const orchestratorConversations = (
      topOrchestrator.organizationSlug
        ? conversationsStore.conversationsByAgent(
            topOrchestrator.name,
            topOrchestrator.organizationSlug,
          )
        : conversationsStore
            .conversationsByAgentType(
              (topOrchestrator.agentType || "orchestrator") as AgentType,
            )
            .filter(
              (conv) =>
                (conv as ConversationWithAgent).agentName ===
                topOrchestrator.name,
            )
    ) as ExtendedConversation[];

    const orchestratorMatchesSearch =
      !searchQuery.value ||
      topOrchestrator.name
        .toLowerCase()
        .includes(searchQuery.value.toLowerCase()) ||
      topOrchestrator.metadata?.displayName
        ?.toLowerCase()
        .includes(searchQuery.value.toLowerCase()) ||
      topOrchestrator.metadata?.description
        ?.toLowerCase()
        .includes(searchQuery.value.toLowerCase());

    if (orchestratorMatchesSearch) {
      // Build the agents array starting with the orchestrator
      const topOrchestratorMetadata = topOrchestrator.metadata as
        | ExtendedMetadata
        | undefined;
      const orchestratorAgents: EnhancedAgent[] = [
        {
          name: topOrchestrator.name,
          type: topOrchestrator.agentType || "unknown",
          displayName:
            topOrchestrator.metadata?.displayName || topOrchestrator.name,
          description: topOrchestrator.metadata?.description || "",
          execution_modes: topOrchestratorMetadata?.execution_modes || [],
          metadata: {
            displayName: topOrchestrator.metadata?.displayName,
            description: topOrchestrator.metadata?.description,
            hasCustomUI:
              (topOrchestrator.metadata?.custom?.hasCustomUI as boolean) ||
              false,
            customUIComponent:
              (topOrchestrator.metadata?.custom?.customUIComponent as string) ||
              null,
            execution_modes: topOrchestratorMetadata?.execution_modes,
            custom: topOrchestratorMetadata?.custom,
          },
          organizationSlug: topOrchestrator.organizationSlug,
          conversations: orchestratorConversations,
          activeConversations: orchestratorConversations.filter(
            (c: ExtendedConversation) => !c.endedAt,
          ).length,
          totalConversations: orchestratorConversations.length,
        },
      ];

      // Add non-manager children directly to the orchestrator's agents array
      if (topOrchestrator.children) {
        topOrchestrator.children.forEach((child: HierarchyNode) => {
          if (!child.children || child.children.length === 0) {
            // This is a non-manager child - add it to the orchestrator's team
            // For database agents (with organizationSlug), match by organizationSlug; otherwise match by agentType
            const childConversations = (
              child.organizationSlug
                ? conversationsStore.conversationsByAgent(
                    child.name,
                    child.organizationSlug,
                  )
                : conversationsStore
                    .conversationsByAgentType(
                      (child.agentType || "custom") as AgentType,
                    )
                    .filter(
                      (conv) =>
                        (conv as ConversationWithAgent).agentName ===
                        child.name,
                    )
            ) as ExtendedConversation[];
            const orchChildMetadata = child.metadata as
              | ExtendedMetadata
              | undefined;
            orchestratorAgents.push({
              name: child.name,
              type: child.agentType || "unknown",
              displayName: child.metadata?.displayName || child.name,
              description: child.metadata?.description || "",
              execution_modes: orchChildMetadata?.execution_modes || [],
              metadata: {
                displayName: child.metadata?.displayName,
                description: child.metadata?.description,
                hasCustomUI:
                  (child.metadata?.custom?.hasCustomUI as boolean) || false,
                customUIComponent:
                  (child.metadata?.custom?.customUIComponent as string) || null,
                execution_modes: orchChildMetadata?.execution_modes,
                custom: orchChildMetadata?.custom,
              },
              organizationSlug: child.organizationSlug,
              conversations: childConversations,
              activeConversations: childConversations.filter(
                (c: ExtendedConversation) => !c.endedAt,
              ).length,
              totalConversations: childConversations.length,
            });
          }
        });

        // Sort orchestrator agents: dashboard agents first, then regular agents
        // Keep the orchestrator itself (first element) in place, only sort children (indices 1+)
        if (orchestratorAgents.length > 1) {
          const DASHBOARD_AGENTS = ["legal-department", "marketing-swarm", "cad-agent"];
          const orchestrator = orchestratorAgents[0];
          const children = orchestratorAgents.slice(1);

          children.sort((a, b) => {
            const aName = (a.name || "").toLowerCase().replace(/[-_\s]/g, "-");
            const bName = (b.name || "").toLowerCase().replace(/[-_\s]/g, "-");
            const aIsDashboard = DASHBOARD_AGENTS.includes(aName);
            const bIsDashboard = DASHBOARD_AGENTS.includes(bName);

            // Put dashboard agents first
            if (aIsDashboard && !bIsDashboard) return -1;
            if (!aIsDashboard && bIsDashboard) return 1;

            // Within same group, sort alphabetically
            return aName.localeCompare(bName);
          });

          // Reconstruct array with orchestrator first, then sorted children
          orchestratorAgents.length = 0;
          orchestratorAgents.push(orchestrator, ...children);
        }
      }

      // Update the orchestrator's conversation count to include all child conversations
      if (orchestratorAgents.length > 1) {
        // Only if there are child agents
        const totalChildConversations = orchestratorAgents
          .slice(1)
          .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
          .reduce((sum, a) => sum + (a.totalConversations || 0), 0);
        orchestratorAgents[0].totalConversations =
          orchestratorConversations.length + totalChildConversations;
        orchestratorAgents[0].activeConversations =
          orchestratorConversations.filter(
            (c: ExtendedConversation) => !c.endedAt,
          ).length +
          orchestratorAgents
            .slice(1)
            .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
            .reduce((sum, a) => sum + (a.activeConversations || 0), 0);
      }

      groups.push({
        type: "top_orchestrator",
        agents: orchestratorAgents,
        totalConversations: orchestratorAgents
          .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
          .reduce((sum, a) => sum + (a.totalConversations || 0), 0),
        isManager: false,
        isCEO: true, // Keep this for backward compatibility with template
        isCEOAgent: true, // Keep this for backward compatibility with template
      });
    }

    // Process manager children as separate accordions
    if (topOrchestrator.children) {
      topOrchestrator.children.forEach((child: HierarchyNode) => {
        // Only process as separate group if it has its own children (is a manager)
        if (child.children && child.children.length > 0) {
          processNode(child);
        }
      });
    }
  }

  // Process any remaining root nodes that aren't the top orchestrator
  // If topOrchestrator exists and has children, filter it out; otherwise process all agents
  const otherRootNodes = flatAgents.filter((agent: HierarchyNode) => {
    if (
      topOrchestrator &&
      topOrchestrator.children &&
      topOrchestrator.children.length > 0
    ) {
      // Only filter out if topOrchestrator actually has children
      return agent.name !== topOrchestrator.name;
    }
    // If no real orchestrator, process all agents as standalone
    return true;
  });

  const specialistAgents: EnhancedAgent[] = [];

  otherRootNodes.forEach((agent: HierarchyNode) => {
    // If this node has children, it's an orchestrator - process it as a manager group
    if (agent.children && agent.children.length > 0) {
      processNode(agent);
    } else {
      // This is a standalone specialist/agent
      // Always try to match by agent name first, with organizationSlug if available
      // Fall back to agentType matching only if no organizationSlug

      // Try with organizationSlug first (even if null, to match conversations with null org)
      // Pass undefined if organizationSlug is not set, so conversationsByAgent can match any org
      const nodeConversations = conversationsStore.conversationsByAgent(
        agent.name,
        agent.organizationSlug !== undefined
          ? agent.organizationSlug
          : undefined,
      ) as ExtendedConversation[];

      const matchesSearch =
        !searchQuery.value ||
        agent.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        agent.metadata?.displayName
          ?.toLowerCase()
          .includes(searchQuery.value.toLowerCase()) ||
        agent.metadata?.description
          ?.toLowerCase()
          .includes(searchQuery.value.toLowerCase());

      if (matchesSearch) {
        const specialistMetadata = agent.metadata as
          | ExtendedMetadata
          | undefined;
        specialistAgents.push({
          name: agent.name,
          type: agent.agentType || "unknown",
          displayName: agent.metadata?.displayName || agent.name,
          description: agent.metadata?.description || "",
          execution_modes: specialistMetadata?.execution_modes || [],
          metadata: {
            displayName: agent.metadata?.displayName,
            description: agent.metadata?.description,
            hasCustomUI:
              (agent.metadata?.custom?.hasCustomUI as boolean) || false,
            customUIComponent:
              (agent.metadata?.custom?.customUIComponent as string) || null,
            execution_modes: specialistMetadata?.execution_modes,
            custom: specialistMetadata?.custom,
          },
          organizationSlug: agent.organizationSlug,
          conversations: nodeConversations,
          activeConversations: nodeConversations.filter(
            (c: ExtendedConversation) => !c.endedAt,
          ).length,
          totalConversations: nodeConversations.length,
        });
      }
    }
  });

  // Add "Specialists" group only if there are agents not properly under CEO
  if (specialistAgents.length > 0) {
    // Sort specialist agents: dashboard agents first, then regular agents
    const DASHBOARD_AGENTS = ["legal-department", "marketing-swarm", "cad-agent"];
    specialistAgents.sort((a, b) => {
      const aName = (a.name || "").toLowerCase().replace(/[-_\s]/g, "-");
      const bName = (b.name || "").toLowerCase().replace(/[-_\s]/g, "-");
      const aIsDashboard = DASHBOARD_AGENTS.includes(aName);
      const bIsDashboard = DASHBOARD_AGENTS.includes(bName);

      // Put dashboard agents first
      if (aIsDashboard && !bIsDashboard) return -1;
      if (!aIsDashboard && bIsDashboard) return 1;

      // Within same group, sort alphabetically
      return aName.localeCompare(bName);
    });

    groups.push({
      type: "specialists",
      agents: specialistAgents,
      totalConversations: specialistAgents
        .filter((a) => !isDashboardOnlyAgent(a as InteractionAgent))
        .reduce((sum, a) => sum + (a.totalConversations || 0), 0),
      isManager: false,
      isSpecialists: true,
    });
  }

  return groups;
});

// Check if we're viewing all organizations
const isAllOrgsMode = computed(() => authStore.currentOrganization === "*");

// Get organization/department display name
const getOrgDisplayName = (orgSlug: string | null | undefined): string => {
  if (!orgSlug || orgSlug === "unassigned") return "Unassigned";
  // Check if it matches a known organization
  const org = authStore.userOrganizations.find(
    (o) => o.organizationSlug === orgSlug,
  );
  if (org) return org.organizationName;
  // Otherwise format the slug as a title (e.g., "legal" -> "Legal")
  return orgSlug.charAt(0).toUpperCase() + orgSlug.slice(1).replace(/-/g, " ");
};

// Get the grouping key for an agent (organizationSlug or department)
const getAgentGroupKey = (agent: EnhancedAgent): string => {
  // First try organizationSlug
  if (agent.organizationSlug) return agent.organizationSlug;
  // Fall back to department from metadata
  const department = agent.metadata?.custom?.department as string | undefined;
  if (department) return department;
  // Default to unassigned
  return "unassigned";
};

// Group hierarchy by organization/department when in all-orgs mode
interface OrgGroupedHierarchy {
  orgSlug: string;
  orgName: string;
  groups: HierarchyGroup[];
  totalConversations: number;
}

const hierarchyGroupedByOrg = computed((): OrgGroupedHierarchy[] => {
  if (!isAllOrgsMode.value) {
    // Single org mode - no grouping needed
    return [];
  }

  // Group agents by organizationSlug or department
  // For specialist groups, we need to split agents by their individual department
  const orgMap = new Map<string, HierarchyGroup[]>();

  for (const group of hierarchyGroups.value) {
    if (group.isSpecialists) {
      // Split specialist agents by their individual department
      const agentsByDept = new Map<string, EnhancedAgent[]>();

      for (const agent of group.agents) {
        const dept = getAgentGroupKey(agent);
        if (!agentsByDept.has(dept)) {
          agentsByDept.set(dept, []);
        }
        agentsByDept.get(dept)!.push(agent);
      }

      // Create a separate specialist group for each department
      for (const [dept, agents] of agentsByDept.entries()) {
        if (!orgMap.has(dept)) {
          orgMap.set(dept, []);
        }
        orgMap.get(dept)!.push({
          type: `specialists-${dept}`,
          agents,
          totalConversations: agents.reduce(
            (sum, a) => sum + (a.totalConversations || 0),
            0,
          ),
          isSpecialists: true,
        });
      }
    } else {
      // For orchestrators/managers, use the first agent's department
      const orgSlug = getAgentGroupKey(group.agents[0]);

      if (!orgMap.has(orgSlug)) {
        orgMap.set(orgSlug, []);
      }
      orgMap.get(orgSlug)!.push(group);
    }
  }

  // Convert to array and sort by org name
  const result: OrgGroupedHierarchy[] = [];
  for (const [orgSlug, groups] of orgMap.entries()) {
    result.push({
      orgSlug,
      orgName: getOrgDisplayName(orgSlug),
      groups,
      totalConversations: groups.reduce(
        (sum, g) => sum + g.totalConversations,
        0,
      ),
    });
  }

  // Sort alphabetically by org name, but put "Unassigned" last
  return result.sort((a, b) => {
    if (a.orgSlug === "unassigned") return 1;
    if (b.orgSlug === "unassigned") return -1;
    return a.orgName.localeCompare(b.orgName);
  });
});

// Methods
const refreshDataForOrganization = async (organization: string) => {
  try {
    if (!organization) {
      return;
    }

    const isAllOrgs = organization === "*";
    console.log(
      "📡 Fetching agents for organization:",
      organization,
      isAllOrgs ? "(all orgs)" : "",
    );

    agentsStore.setLoading(true);
    agentsStore.clearError();

    // Load agents and hierarchy from service
    // For all-orgs mode (*), don't pass organization filter to get all agents
    const [agents, hierarchy] = await Promise.all([
      agentsService.getAvailableAgents(isAllOrgs ? undefined : organization),
      agentsService
        .getAgentHierarchy(isAllOrgs ? undefined : organization)
        .catch(() => null),
    ]);

    console.log(
      "✅ Received agents:",
      agents?.length || 0,
      "for org:",
      organization,
    );

    let finalAgents = agents;
    let finalHierarchy = hierarchy;

    // Only filter by organization if NOT in all-orgs mode
    if (!isAllOrgs) {
      // Filter agents by organization
      finalAgents = Array.isArray(agents)
        ? agents.filter((agent) => {
            if (!agent || typeof agent !== "object") return false;
            if (!("organization" in agent) || !agent.organization) return true;
            return (
              agent.organization === organization ||
              agent.organization === "global"
            );
          })
        : [];

      // Filter hierarchy by organization
      const { filterHierarchyByOrganization } = await import(
        "@/stores/agentsStore"
      );
      const filteredHierarchyResult = hierarchy
        ? filterHierarchyByOrganization(hierarchy, organization)
        : null;
      finalHierarchy =
        filteredHierarchyResult as unknown as AgentHierarchyResponse | null;
    } else {
      // All-orgs mode: normalize hierarchy but don't filter
      const { normalizeHierarchyResponse } = await import(
        "@/stores/agentsStore"
      );
      if (hierarchy) {
        const normalized = normalizeHierarchyResponse(hierarchy);
        finalHierarchy = {
          data: normalized.data,
          metadata: normalized.metadata,
        } as unknown as AgentHierarchyResponse;
      }
    }

    // Update store via mutations
    agentsStore.setAvailableAgents(finalAgents);
    agentsStore.setAgentHierarchy(
      finalHierarchy as unknown as HierarchyNode | null,
    );
    agentsStore.setLastLoadedOrganization(organization);
    agentsStore.setLoading(false);

    await conversationsService.fetchConversations(true);
  } catch (err) {
    console.error("Failed to refresh data:", err);
    agentsStore.setError("Failed to refresh agents");
    agentsStore.setLoading(false);
  }
};

const refreshData = async () => {
  const authStore = useAuthStore();
  const organization = authStore.currentOrganization;
  if (organization) {
    await refreshDataForOrganization(organization);
  }
};

const filterAgents = () => {
  // Filtering is handled in computed property
};

/**
 * Get the interaction mode config for an agent.
 * Wraps the utility function for template use.
 * Uses InteractionAgent type which includes metadata properties.
 */
const _getAgentInteractionMode = (
  _agent: InteractionAgent,
): InteractionModeConfig => {
  return getInteractionMode(_agent);
};

/**
 * Check if agent should show dashboard icon.
 * Accepts any agent-like object and casts to InteractionAgent for metadata access.
 */
const agentShowsDashboard = (agent: unknown): boolean => {
  return shouldShowDashboardIcon(agent as InteractionAgent);
};

/**
 * Check if agent should show conversation icon.
 * Accepts any agent-like object and casts to InteractionAgent for metadata access.
 */
const agentShowsConversation = (agent: unknown): boolean => {
  return shouldShowConversationIcon(agent as InteractionAgent);
};

/**
 * Check if agent should hide conversation count.
 * Dashboard-only agents (prediction, risk) use a single shared conversation per session,
 * so displaying individual conversation counts is misleading.
 */
const shouldHideConversationCount = (agent: unknown): boolean => {
  return isDashboardOnlyAgent(agent as InteractionAgent);
};

/**
 * Check if all agents in a group are dashboard-only agents.
 * If so, the group-level conversation count badge should be hidden.
 */
const shouldHideGroupConversationCount = (group: HierarchyGroup): boolean => {
  if (!group.agents || group.agents.length === 0) return true;
  return group.agents.every((agent) =>
    isDashboardOnlyAgent(agent as InteractionAgent),
  );
};

/**
 * Check if all agents in an org are dashboard-only agents.
 * If so, the org-level conversation count badge should be hidden.
 */
const shouldHideOrgConversationCount = (
  orgGroup: OrgGroupedHierarchy,
): boolean => {
  if (!orgGroup.groups || orgGroup.groups.length === 0) return true;
  return orgGroup.groups.every((group) =>
    shouldHideGroupConversationCount(group),
  );
};

/**
 * Open the dashboard for a dashboard-mode agent.
 * Accepts any agent-like object and casts to InteractionAgent for metadata access.
 */
const openAgentDashboard = (agent: unknown) => {
  const componentName = getDashboardComponent(agent as InteractionAgent);
  if (componentName) {
    emit("open-dashboard", agent as Agent, componentName);
  }
};

/**
 * Handle agent action click - routes to dashboard or conversation based on mode.
 */
const _handleAgentAction = (_agent: unknown) => {
  const mode = getInteractionMode(_agent as InteractionAgent);
  if (mode.mode === "dashboard" && mode.canOpenDashboard) {
    openAgentDashboard(_agent);
  } else {
    createNewConversation(_agent as Agent);
  }
};

const createNewConversation = async (agent: Agent) => {
  try {
    emit("agent-selected", agent);
  } catch (err) {
    console.error("Failed to create conversation:", err);
  }
};

// Wrapper methods for header buttons that also expand the accordion
const startNewConversation = async (agent: Agent, groupType: string) => {
  try {
    // Expand the accordion if not already expanded
    if (!expandedAccordions.value.includes(groupType)) {
      expandedAccordions.value.push(groupType);
    }
    // Create the conversation
    await createNewConversation(agent);
  } catch (err) {
    console.error("Failed to start conversation:", err);
  }
};

// Lifecycle
onMounted(async () => {
  // Don't fetch data until RBAC is fully initialized (token set, orgs loaded).
  // During login, setTokenData triggers reactivity that can mount this component
  // before apiService has the auth token, causing 401s.
  if (!authStore.isInitialized) {
    return;
  }

  // Fetch data if not already loaded
  if (!agentHierarchy.value) {
    await refreshData();
  }

  // Ensure conversations are loaded
  const hasConversations = storeConversations.value.length > 0;
  if (!hasConversations) {
    try {
      await conversationsService.fetchConversations(true);
    } catch (error) {
      console.error("❌ [AgentTreeView] Failed to load conversations:", error);
    }
  }
});

// Watch for organization changes and refresh agents
watch(
  () => authStore.currentOrganization,
  async (newOrg, oldOrg) => {
    if (newOrg && newOrg !== oldOrg) {
      console.log(
        "🔄 Organization changed in AgentTreeView, refreshing agents:",
        { oldOrg, newOrg },
      );

      // Clear stores first to avoid showing stale data
      agentsStore.resetAgents();

      // Then refresh with new org data - pass newOrg directly to avoid timing issues
      await refreshDataForOrganization(newOrg);
      await conversationsService.fetchConversations(true);
    }
  },
);
</script>

<style scoped>
.agent-tree-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-container {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--ion-color-step-150);
}

.search-container ion-searchbar {
  flex: 1;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
}

.hierarchy-container {
  flex: 1;
  overflow-y: auto;
}

.agent-group {
  margin-bottom: 8px;
}

.accordion-content {
  padding: 0;
}

.agent-item {
  border-bottom: 1px solid var(--ion-color-step-100);
}

.agent-item:last-of-type {
  border-bottom: none;
}

.nested-agent ion-item {
  --padding-start: 12px;
}

.nested-agent-item ion-icon {
  margin-right: 8px;
}

/* Hierarchy Actions */
.hierarchy-actions {
  margin-top: 16px;
  padding: 0 16px 16px 16px;
}

.action-separator {
  height: 1px;
  background: var(--ion-color-step-150);
  margin-bottom: 12px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.hierarchy-action-btn {
  --padding-start: 12px;
  --padding-end: 12px;
  font-size: 0.9em;
}

/* Agent section styling */
.agent-section {
  margin-bottom: 8px;
}

/* Conversations list styling */
.conversations-list {
  background: var(--ion-color-step-50, #f7f7f7);
  border-radius: 8px;
  margin: 4px 8px;
}

.conversation-item {
  --padding-start: 24px;
  --min-height: 40px;
}

.conversation-item ion-label p {
  margin: 2px 0;
  font-size: 0.9em;
}

.conversation-meta {
  color: var(--ion-color-medium);
  font-size: 0.8em !important;
}

/* Agent actions styling */
.agent-actions {
  padding: 4px 16px 8px 16px;
}

.agent-action-btn {
  --color: var(--ion-color-primary);
  font-size: 0.9em;
}

/* Header buttons styling */
.manager-header {
  position: relative;
  --background: rgba(var(--ion-color-tertiary-rgb), 0.08);
  --background-hover: rgba(var(--ion-color-tertiary-rgb), 0.12);
  --color: var(--ion-text-color);
  --padding-start: 12px;
}

.manager-icon {
  color: var(--ion-color-tertiary);
  font-size: 20px;
  margin-right: 8px;
}

.manager-header ion-label {
  flex: 1;
}

.manager-header ion-label h3 {
  color: var(--ion-color-tertiary-shade);
  font-weight: 500;
}

.conversation-count {
  margin-right: 4px;
}

.manager-conversation-count {
  margin-right: 4px;
  background: var(--ion-color-tertiary);
  color: var(--ion-color-tertiary-contrast, #fff);
}

.manager-conversation-count[color="medium"] {
  background: var(--ion-color-medium);
}

.header-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  margin-left: auto;
  padding-right: 4px;
}

/* Fixed-width action slots for consistent alignment */
/* Agent action buttons - using Ionic slot="end" for right alignment */
.agent-badge {
  font-size: 0.7rem;
  padding: 2px 6px;
  min-width: auto;
  margin: 0;
}

.agent-action-btn {
  --padding-start: 2px;
  --padding-end: 2px;
  --padding-top: 2px;
  --padding-bottom: 2px;
  margin: 0;
  min-width: 24px;
  min-height: 24px;
}

.agent-action-btn ion-icon {
  font-size: 16px;
}

/* Chevron button in agent-meta - stacked below badge */
.agent-meta .agent-action-btn {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 20px;
  min-height: 20px;
  height: 20px;
  margin-top: 2px;
}

.agent-meta .agent-action-btn ion-icon {
  font-size: 18px;
}

/* Legacy support */
.header-actions {
  z-index: 10;
}

/* CEO header and item styling */
.ceo-header {
  position: relative;
  --background: rgba(var(--ion-color-primary-rgb), 0.08);
  --background-hover: rgba(var(--ion-color-primary-rgb), 0.12);
  --color: var(--ion-text-color);
  --padding-start: 12px;
}

.ceo-icon {
  color: var(--ion-color-primary);
  font-size: 20px;
  margin-right: 8px;
}

.ceo-header ion-label {
  flex: 1;
}

.ceo-header ion-label h3 {
  color: var(--ion-color-primary-shade);
  font-weight: 500;
}

.ceo-conversation-count {
  margin-right: 4px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast, #fff);
}

.ceo-conversation-count[color="medium"] {
  background: var(--ion-color-medium);
}

/* CEO content sections */
.ceo-content {
  padding: 0;
}

.ceo-conversations {
  margin-bottom: 12px;
}

.ceo-conversation {
  --background: var(--ion-color-step-50);
}

.ceo-item {
  --padding-start: 12px;
  --background: var(--ion-item-background, var(--ion-background-color));
}

.ceo-item ion-icon {
  margin-right: 8px;
}

/* Agent row - flex container for item + external meta */
.agent-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 2px 0 2px 8px;
}

.agent-row ion-item {
  flex: 1;
  min-width: 0;
  --padding-end: 0;
  --inner-padding-end: 2px;
}

/* Right-justify action buttons inside the item - tight to edge */
.agent-row ion-item ion-button[slot="end"] {
  margin: 0;
  --padding-start: 4px;
  --padding-end: 4px;
}

/* Agent meta - badge and arrow outside the item box - stacked vertically */
.agent-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 4px 6px;
  flex-shrink: 0;
  min-width: 32px;
}

/* Specialist item styling */
.specialist-item {
  --padding-start: 12px;
  --background: var(--ion-color-step-100, #e7e7e7);
  border-radius: 8px 0 0 8px;
}

/* Nested agent item styling */
.nested-agent-item {
  --background: var(--ion-color-step-100, #e7e7e7);
  border-radius: 8px 0 0 8px;
}

/* Section titles for manager content and team members */
.section-title {
  text-align: center;
  color: var(--ion-color-primary);
  font-size: 14px;
  font-weight: 600;
  margin: 12px 16px 8px 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Organization section styling (all-orgs mode) */
.org-section {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--ion-color-step-200, #d0d0d0);
  padding-bottom: 8px;
}

.org-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.org-header {
  display: flex;
  align-items: center;
  padding: 12px 16px 8px 16px;
  background: linear-gradient(
    135deg,
    rgba(var(--ion-color-primary-rgb), 0.08),
    rgba(var(--ion-color-secondary-rgb), 0.05)
  );
  border-radius: 8px 8px 0 0;
  margin-bottom: 4px;
}

.org-icon {
  font-size: 20px;
  color: var(--ion-color-primary);
  margin-right: 10px;
}

.org-name {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-color-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.org-conversation-count {
  font-size: 0.75rem;
}

.org-nested {
  margin-left: 8px;
}

/* Conversation toggle header (for CEO/Manager's own conversations) */
.conversation-toggle-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  background: var(--ion-color-step-50, #f7f7f7);
  border-radius: 6px;
  margin: 8px 12px;
  transition: background 0.2s ease;
}

.conversation-toggle-header:hover {
  background: var(--ion-color-step-100, #e7e7e7);
}

.toggle-chevron {
  font-size: 16px;
  color: var(--ion-color-medium);
  margin-right: 8px;
  transition: transform 0.2s ease;
}

.toggle-label {
  flex: 1;
  font-size: 0.85rem;
  color: var(--ion-color-medium-shade);
  font-weight: 500;
}

.toggle-badge {
  font-size: 0.75rem;
}

/* Toggle button styling for inline header buttons */
.toggle-btn {
  --color: var(--ion-color-medium);
}

.toggle-btn:hover {
  --color: var(--ion-color-primary);
}

/* Dashboard agent styling */

.dashboard-btn {
  --color: var(--ion-color-tertiary);
}

.dashboard-btn:hover {
  --color: var(--ion-color-tertiary-shade);
}

/* Dashboard agent item styling */
.specialist-item ion-icon[color="tertiary"],
.nested-agent-item ion-icon[color="tertiary"] {
  font-size: 18px;
}

/* Unscoped overrides for robust dark mode targeting */
html.ion-palette-dark .agent-tree-container .org-name,
html[data-theme="dark"] .agent-tree-container .org-name {
  color: var(--ion-color-tertiary) !important;
}

/* Agent Names Dark Mode Override */
html.ion-palette-dark .nested-agent-item h4,
html.ion-palette-dark .specialist-item h3,
html[data-theme="dark"] .nested-agent-item h4,
html[data-theme="dark"] .specialist-item h3 {
  color: var(--ion-color-tertiary) !important;
}

/* Agent Icons Dark Mode Override */
html.ion-palette-dark .specialist-item ion-icon[slot="start"],
html.ion-palette-dark .nested-agent-item ion-icon[slot="start"],
html[data-theme="dark"] .specialist-item ion-icon[slot="start"],
html[data-theme="dark"] .nested-agent-item ion-icon[slot="start"] {
  color: var(--ion-color-tertiary) !important;
}

/* Org Header Icons Dark Mode Override */
html.ion-palette-dark .org-icon,
html[data-theme="dark"] .org-icon {
  color: var(--ion-color-tertiary) !important;
}

/* Agent Action Buttons Dark Mode Override */
html.ion-palette-dark .agent-action-btn,
html[data-theme="dark"] .agent-action-btn {
  --color: var(--ion-color-tertiary) !important;
  color: var(--ion-color-tertiary) !important;
}

/* Agent Badges Dark Mode Override */
html.ion-palette-dark .agent-badge,
html[data-theme="dark"] .agent-badge {
  --background: var(--ion-color-tertiary) !important;
  --color: var(--ion-color-tertiary-contrast) !important;
}

/* Agent Row H3 Dark Mode Override (White) */
html.ion-palette-dark .agent-row h3,
html[data-theme="dark"] .agent-row h3 {
  color: white !important;
}
</style>
