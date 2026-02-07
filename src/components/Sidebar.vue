<template>
  <div class="sidebar">
    <div class="skill-buttons-dropdown">
      <button class="dropdown-btn">Skills</button>
      <div class="dropdown-content">
        <button class="skill-action">Skill 1</button>
        <button class="skill-action">Skill 2</button>
        <button class="skill-action">Skill 3</button>
        <button class="skill-action">Skill 4</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      skills: [],
    };
  },
  methods: {
    // Define skill action methods here
  },
};
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
}

.skill-buttons-dropdown {
  position: relative;
}

.dropdown-btn {
  background-color: #f1f1f1;
  color: black;
  border: none;
  padding: 10px;
  font-size: 16px;
  cursor: pointer;
}

.dropdown-content {
  display: none;
  position: absolute;
  background-color: #f9f9f9;
  min-width: 160px;
  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
  z-index: 1;
}

.dropdown-btn:hover + .dropdown-content, .dropdown-content:hover {
  display: block;
}

.skill-action {
  background-color: transparent;
  border: none;
  padding: 12px 16px;
  text-align: left;
  display: block;
  width: 100%;
  box-sizing: border-box;
}

.skill-action:hover {
  background-color: #ddd;
}
</style>